# Analysis Output Structure

## Overview

This document describes the output structure of the analysis service for different analysis types, and whether analyses are **email-level** or **thread-level**.

## Key Finding: All Analyses are Email-Level

**All analyses are EMAIL-LEVEL** - they analyze individual emails, though some may use thread context for better understanding.

- **Email-level**: Each analysis result is tied to a specific email (`emailId`)
- **Thread context**: Some analyses (like escalation, churn) may use thread context to understand the conversation history, but the result is still for the specific email being analyzed

## Output Structure

### Wrapper Structure: `AnalysisResult<T>`

All analysis results are wrapped in an `AnalysisResult` structure:

```typescript
interface AnalysisResult<T = any> {
  type: AnalysisType;              // 'sentiment', 'escalation', etc.
  result: T;                       // The actual analysis result (see schemas below)
  modelUsed: string;               // Which model was used (primary or fallback)
  reasoning?: string;              // Reasoning/thinking steps if available
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

### Batch Response Structure

When multiple analyses are run together, the service returns a `BatchAnalysisResult`:

```typescript
type BatchAnalysisResult = Map<AnalysisType, AnalysisResult>;
```

**Example JSON response:**
```json
{
  "success": true,
  "data": {
    "results": {
      "sentiment": {
        "value": "positive",
        "confidence": 0.95
      },
      "escalation": {
        "detected": false,
        "confidence": 0.88,
        "reason": null,
        "urgency": null
      },
      "churn": {
        "riskLevel": "low",
        "confidence": 0.82,
        "indicators": [],
        "reason": null
      }
    }
  }
}
```

**Note**: The wrapper metadata (`modelUsed`, `reasoning`, `usage`) is not included in the API response - only the `result` field is returned. The metadata is available in the analysis service logs.

---

## Analysis Type Output Schemas

### 1. Sentiment Analysis (`sentiment`)

**Level**: Email-level  
**Uses Thread Context**: Optional (can analyze without context)

```typescript
{
  value: 'positive' | 'negative' | 'neutral',
  confidence: number  // 0-1, how confident in the sentiment classification
}
```

**Example:**
```json
{
  "value": "positive",
  "confidence": 0.95
}
```

---

### 2. Escalation Detection (`escalation`)

**Level**: Email-level  
**Uses Thread Context**: Yes (recommended for better detection)

```typescript
{
  detected: boolean,              // true if escalation is needed
  confidence: number,             // 0-1
  reason?: string,                // Why escalation is needed
  urgency?: 'low' | 'medium' | 'high' | 'critical'
}
```

**Example:**
```json
{
  "detected": true,
  "confidence": 0.92,
  "reason": "Customer threatening to cancel subscription",
  "urgency": "high"
}
```

---

### 3. Upsell Detection (`upsell`)

**Level**: Email-level  
**Uses Thread Context**: Optional

```typescript
{
  detected: boolean,              // true if upsell opportunity exists
  confidence: number,            // 0-1
  opportunity?: string,          // Description of the upsell opportunity
  product?: string               // Product/service mentioned
}
```

**Example:**
```json
{
  "detected": true,
  "confidence": 0.87,
  "opportunity": "Customer asking about enterprise features",
  "product": "Enterprise Plan"
}
```

---

### 4. Churn Risk Assessment (`churn`)

**Level**: Email-level  
**Uses Thread Context**: Yes (recommended - churn signals build over time)

```typescript
{
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
  confidence: number,            // 0-1
  indicators: string[],          // Specific phrases/behaviors indicating churn risk
  reason?: string                // Summary of churn risk
}
```

**Example:**
```json
{
  "riskLevel": "high",
  "confidence": 0.91,
  "indicators": [
    "threatening to cancel",
    "mentioning competitors",
    "expressing frustration with pricing"
  ],
  "reason": "Customer comparing pricing with competitors and expressing dissatisfaction"
}
```

---

### 5. Kudos Detection (`kudos`)

**Level**: Email-level  
**Uses Thread Context**: Optional

```typescript
{
  detected: boolean,             // true if positive feedback detected
  confidence: number,           // 0-1
  message?: string,             // The positive feedback message
  category?: 'product' | 'service' | 'team' | 'other'
}
```

**Example:**
```json
{
  "detected": true,
  "confidence": 0.96,
  "message": "Love the new dashboard feature!",
  "category": "product"
}
```

---

### 6. Competitor Mention Detection (`competitor`)

**Level**: Email-level  
**Uses Thread Context**: Optional

```typescript
{
  detected: boolean,             // true if competitors mentioned
  confidence: number,           // 0-1
  competitors?: string[],       // List of competitor names mentioned
  context?: string              // How competitors were mentioned
}
```

**Example:**
```json
{
  "detected": true,
  "confidence": 0.89,
  "competitors": ["Competitor A", "Competitor B"],
  "context": "Customer comparing our pricing to Competitor A and Competitor B"
}
```

---

### 7. Signature Extraction (`signature-extraction`)

**Level**: Email-level  
**Uses Thread Context**: No

```typescript
{
  name?: string,
  title?: string,
  company?: string,
  email?: string,               // Must be valid email format
  phone?: string,
  mobile?: string,
  address?: string,
  website?: string,
  linkedin?: string,
  twitter?: string
}
```

**Example:**
```json
{
  "name": "John Doe",
  "title": "VP of Sales",
  "company": "Acme Corp",
  "email": "john.doe@acme.com",
  "phone": "+1-555-123-4567"
}
```

**Note**: Signature extraction results are saved directly to the `contacts` table, not stored as analysis results.

---

## Database Storage Recommendations

### Current State
- **Domain extraction**: Saved to `customers` table ✅
- **Contact extraction**: Saved to `contacts` table ✅
- **Other analyses**: **NOT saved** ❌

### Recommended Schema: `email_analyses` Table

Since all analyses are **email-level**, create a single table to store all analysis results:

```sql
CREATE TABLE email_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Analysis type and result
    analysis_type VARCHAR(50) NOT NULL,  -- 'sentiment', 'escalation', etc.
    result JSONB NOT NULL,                -- The analysis result (validated by schema)
    
    -- Metadata
    model_used VARCHAR(100),             -- Which model was used
    confidence DECIMAL(3,2),              -- Extracted from result for easy querying
    reasoning TEXT,                       -- LLM reasoning if available
    
    -- Token usage tracking
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT uniq_email_analysis_type UNIQUE (email_id, analysis_type)
);

-- Indexes for common queries
CREATE INDEX idx_email_analyses_email ON email_analyses(email_id);
CREATE INDEX idx_email_analyses_tenant ON email_analyses(tenant_id);
CREATE INDEX idx_email_analyses_type ON email_analyses(analysis_type);
CREATE INDEX idx_email_analyses_confidence ON email_analyses(confidence);
```

### Why Separate Table?

1. **Flexibility**: Can store multiple analysis results per email without schema changes
2. **Performance**: JSONB allows efficient querying of nested result fields
3. **History**: Can track analysis result changes over time (if needed)
4. **Separation of Concerns**: Keeps `emails` table focused on email data, not analysis results
5. **Scalability**: Easy to add new analysis types without modifying core tables

### Query Examples

```sql
-- Get all analyses for an email
SELECT * FROM email_analyses WHERE email_id = '...';

-- Get high-confidence escalations
SELECT * FROM email_analyses 
WHERE analysis_type = 'escalation' 
  AND result->>'detected' = 'true'
  AND confidence > 0.9;

-- Get high churn risk emails
SELECT e.*, ea.result 
FROM emails e
JOIN email_analyses ea ON e.id = ea.email_id
WHERE ea.analysis_type = 'churn'
  AND (ea.result->>'riskLevel') IN ('high', 'critical');
```

---

## Summary

| Analysis Type | Level | Uses Thread Context | Output Structure |
|--------------|-------|---------------------|------------------|
| Sentiment | Email | Optional | `{ value, confidence }` |
| Escalation | Email | Yes (recommended) | `{ detected, confidence, reason?, urgency? }` |
| Upsell | Email | Optional | `{ detected, confidence, opportunity?, product? }` |
| Churn | Email | Yes (recommended) | `{ riskLevel, confidence, indicators[], reason? }` |
| Kudos | Email | Optional | `{ detected, confidence, message?, category? }` |
| Competitor | Email | Optional | `{ detected, confidence, competitors?, context? }` |
| Signature | Email | No | `{ name?, title?, company?, email?, ... }` |

**All analyses are EMAIL-LEVEL** - results should be stored with `email_id` as the foreign key.
