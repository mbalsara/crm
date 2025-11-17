# Email Analysis Decisions Summary

## Overview

This document summarizes the key architectural decisions for the email analysis system, including execution strategy, framework design, and implementation approach.

---

## 1. Execution Strategy Decisions

### 1.1 Always-Run Analyses

**Domain Extraction** ✅
- **Execution**: Synchronous, blocking
- **When**: Always executed for every email
- **Output**: Creates/updates companies table

**Contact Extraction** ✅
- **Execution**: Synchronous, blocking
- **When**: Always executed for every email
- **Output**: Creates/updates contacts table, links to companies

### 1.2 Conditional Analyses

**Signature Parsing** ⚠️
- **Execution**: Asynchronous, independent sub-workflow
- **When**: Only if signature is present AND regex is insufficient
- **Decision Logic**:
  1. Detect signature presence (heuristics)
  2. Try regex extraction first
  3. Count fields found (name, title, company, phone, email, address)
  4. If fields < threshold (default: 2) → Use LLM
  5. Optional: Lightweight LLM validation of regex result
- **Output**: Updates contacts.signature_data

**Other Analyses** (Sentiment, Escalation, Upsell, Churn, Kudos, Competitor) ⚠️
- **Execution**: Asynchronous, independent sub-workflows (parallel)
- **When**: Only if enabled in tenant's `analysis_configs.enabled_analyses`
- **Output**: Each analysis updates API independently (non-blocking)

---

## 2. Analysis Framework Requirements

### 2.1 Required Framework Features

✅ **Prompt Management**
- System prompts
- User prompts (with context injection)
- Prompt versioning (for Langfuse observability)

✅ **Model Configuration**
- Primary model per analysis type
- Fallback model (automatic retry)
- Caller-configurable (tenant decides)

✅ **Output Validation**
- Zod schemas for structured JSON
- Type-safe validation
- Error handling for invalid outputs

✅ **Version Tracking**
- Prompt versions tracked per analysis
- Sent to Langfuse for observability
- Enables A/B testing and prompt iteration

✅ **Execution Settings**
- Timeout per analysis
- Max retries per analysis
- Priority/ordering
- Dependencies between analyses
- Cost limits per analysis
- Rate limiting per analysis type

✅ **Independent Execution**
- Each analysis runs as separate Inngest function
- Parallel execution of independent analyses
- Non-blocking updates to API
- Error isolation (one failure doesn't affect others)

### 2.2 Additional Considerations (Added)

✅ **Retry Configuration**: Per-analysis retry settings  
✅ **Timeout Settings**: Per-analysis timeout limits  
✅ **Priority/Ordering**: Control execution order  
✅ **Dependencies**: Some analyses depend on others (e.g., escalation depends on sentiment)  
✅ **Cost Limits**: Per-analysis cost budgets  
✅ **Rate Limiting**: Per-analysis rate limits  
✅ **Output Validation**: Zod schemas for structured JSON  
✅ **Prompt Versioning**: Track prompt versions for A/B testing  
✅ **Model Fallback**: Automatic fallback to secondary model  
✅ **Error Handling**: Graceful degradation per analysis  

---

## 3. Architecture: Independent Sub-Workflows

### 3.1 Design Decision

**Chosen Approach**: Independent Sub-Workflows (Async)

**Rationale:**
- One analysis failure doesn't block others
- Parallel execution of independent analyses
- Independent scaling per analysis type
- Easy to add/remove analysis types
- Better observability (each analysis visible separately)
- Cost optimization (skip expensive analyses if prerequisites fail)

### 3.2 Implementation Pattern

```
Email Inserted Event
    │
    ▼
Main Orchestrator Function
    │
    ├─► Domain Extraction (sync, always)
    ├─► Contact Extraction (sync, always)
    ├─► Signature Check (conditional)
    │   └─► If needed → Signature Parsing (async)
    │
    └─► Send Events for Enabled Analyses (parallel, independent)
        │
        ├─► Sentiment Analysis (async if enabled)
        ├─► Escalation Detection (async if enabled)
        ├─► Upsell Detection (async if enabled)
        ├─► Churn Detection (async if enabled)
        ├─► Kudos Detection (async if enabled)
        └─► Competitor Detection (async if enabled)

Each analysis runs as independent Inngest function
Each analysis updates API independently (non-blocking)
```

---

## 4. Signature Extraction Decision Logic

### 4.1 Multi-Stage Decision Process

**Stage 1: Signature Detection**
- Check if email likely contains a signature
- Look for signature indicators (closing phrases, phone numbers, job titles, separators)
- Focus on last 500 characters (signatures usually at end)

**Stage 2: Regex Extraction**
- Try regex-based extraction first (fast, free)
- Extract: name, title, company, phone, email, address
- Count fields found

**Stage 3: Sufficiency Check**
- If fields found >= threshold (default: 2) → Use regex result
- If fields found < threshold → Use LLM

**Stage 4: Optional LLM Validation**
- Lightweight LLM check of regex result
- If validation fails → Use LLM extraction

**Stage 5: LLM Extraction** (if needed)
- Use SLM (Claude Haiku 3.5 or GPT-4o-mini)
- Fallback to secondary model if primary fails

### 4.2 Configuration

```json
{
  "signature": {
    "requireLLMIfRegexFieldsMissing": 2,  // Use LLM if regex finds < 2 fields
    "validateWithLLM": false,              // Optional: validate regex with LLM
    "alwaysUseLLM": false                  // Force LLM (for testing)
  }
}
```

---

## 5. Analysis Configuration Schema

### 5.1 Database Schema

See `EMAIL_ANALYSIS_DESIGN.md` Section 2.4 for complete SQL schema.

**Key Fields:**
- `enabled_analyses`: JSONB object with boolean flags per analysis type
- `model_configs`: JSONB object with primary/fallback models per analysis type
- `analysis_settings`: JSONB object with analysis-specific settings
- `prompt_versions`: JSONB object with version strings per analysis type
- `custom_prompts`: JSONB object with optional prompt overrides

### 5.2 TypeScript Types

See `ANALYSIS_FRAMEWORK_DESIGN.md` Section 2.2 for complete TypeScript definitions.

**Key Types:**
- `AnalysisType`: Union type of all analysis types
- `AnalysisDefinition`: Complete definition of an analysis (prompt, models, schema, settings)
- `AnalysisConfig`: Tenant-specific configuration
- `ModelConfig`: Primary + fallback model configuration

---

## 6. Implementation Files

### 6.1 Design Documents

- `EMAIL_ANALYSIS_DESIGN.md`: High-level system design
- `EMAIL_ANALYSIS_IMPLEMENTATION.md`: Detailed implementation guide
- `ANALYSIS_FRAMEWORK_DESIGN.md`: Complete analysis framework design
- `ANALYSIS_DECISIONS_SUMMARY.md`: This document

### 6.2 Key Implementation Areas

**Analysis Framework:**
- `apps/analysis/src/framework/registry.ts`: Analysis registry
- `apps/analysis/src/framework/executor.ts`: Analysis executor
- `apps/analysis/src/analyses/definitions.ts`: Analysis definitions

**Inngest Functions:**
- `apps/api/src/emails/functions.ts`: Main orchestrator + individual analysis functions

**Services:**
- `apps/analysis/src/services/signature-parsing.ts`: Signature extraction logic
- `apps/analysis/src/services/domain-extraction.ts`: Domain extraction
- `apps/analysis/src/services/contact-extraction.ts`: Contact extraction
- `apps/analysis/src/services/email-analysis.ts`: Email analysis orchestration

**Configuration:**
- `apps/api/src/analysis/config-service.ts`: Analysis configuration service
- `sql/analysis_configs.sql`: Database schema

---

## 7. Next Steps

1. ✅ **Design Complete**: Framework design finalized
2. ⏳ **Implementation**: Build analysis framework components
3. ⏳ **Inngest Functions**: Create individual analysis functions
4. ⏳ **Signature Logic**: Implement signature detection and decision logic
5. ⏳ **Testing**: Test independent sub-workflow execution
6. ⏳ **Observability**: Set up Langfuse dashboard for monitoring

---

## 8. Open Questions / Future Enhancements

### 8.1 Signature Extraction

- **Q**: Should we cache regex results to avoid re-extraction?
- **Q**: Should we learn from LLM extractions to improve regex patterns?
- **Q**: Should we support custom regex patterns per tenant?

### 8.2 Analysis Framework

- **Q**: Should we support analysis pipelines (chained analyses)?
- **Q**: Should we support conditional analysis execution (e.g., only analyze if sentiment is negative)?
- **Q**: Should we support batch analysis (analyze multiple emails in one LLM call)?

### 8.3 Cost Optimization

- **Q**: Should we implement cost budgets per tenant?
- **Q**: Should we skip analysis for emails from personal domains?
- **Q**: Should we implement analysis result caching?

---

## 9. References

- **Main Design**: `docs/EMAIL_ANALYSIS_DESIGN.md`
- **Implementation Guide**: `docs/EMAIL_ANALYSIS_IMPLEMENTATION.md`
- **Framework Design**: `docs/ANALYSIS_FRAMEWORK_DESIGN.md`
- **Langfuse Integration**: `docs/LANGFUSE_OBSERVABILITY.md`
- **Queue Comparison**: `docs/QUEUE_COMPARISON.md`
- **LLM Abstraction**: `docs/LLM_ABSTRACTION_COMPARISON.md`
