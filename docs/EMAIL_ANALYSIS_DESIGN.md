# Email Analysis System Design

## Executive Summary

This document outlines the design for an intelligent email analysis system that extracts company information, manages contacts, analyzes sentiment and business signals, and enables automated workflows. The system is designed for scalability, cost-effectiveness, security, and extensibility.

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────┐
│  Email Sync     │
│  (Gmail/Outlook)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Email Storage  │
│  (emails table) │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│     Email Analysis Pipeline         │
│  ┌───────────────────────────────┐  │
│  │ 1. Domain Extraction          │  │
│  │ 2. Company Identification     │  │
│  │ 3. Contact Extraction         │  │
│  │ 4. Signature Parsing          │  │
│  │ 5. Email Analysis (LLM/SLM)   │  │
│  │ 6. Task Creation              │  │
│  │ 7. Label Attachment           │  │
│  └───────────────────────────────┘  │
└────────┬─────────────────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐
│  Customers      │     │  Contacts   │
│  Contacts       │     │  Tasks       │
│  Analysis       │     │  Labels      │
└─────────────────┘     └──────────────┘
```

### 1.2 Processing Flow

1. **Email Ingestion**: Emails are synced and stored via existing `bulkInsertWithThreads`
2. **Event Trigger**: After insertion, `email/inserted` event is sent to Inngest
3. **Pipeline Execution**: Inngest function processes email through analysis stages
4. **Results Storage**: Analysis results stored, tasks created, labels applied

---

## 2. Data Models

### 2.1 Customers Table

```sql
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Domain information
    domain VARCHAR(255) NOT NULL, -- e.g., "acme.com" (top-level only)
    domain_type VARCHAR(20) NOT NULL DEFAULT 'business', -- 'business', 'personal', 'excluded'
    
    -- Company information
    name VARCHAR(500), -- Extracted from emails or manual entry
    website VARCHAR(500),
    industry VARCHAR(100),
    
    -- Metadata
    metadata JSONB, -- Additional company data
    
    -- Tracking
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uniq_customers_tenant_domain UNIQUE (tenant_id, domain)
);

CREATE INDEX idx_customers_tenant_domain ON customers(tenant_id, domain);
CREATE INDEX idx_customers_domain_type ON customers(tenant_id, domain_type);
```

### 2.2 Contacts Table

```sql
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    
    -- Contact information
    email VARCHAR(500) NOT NULL,
    name VARCHAR(500),
    
    -- Extracted from signature
    title VARCHAR(200),
    phone VARCHAR(50),
    company_name VARCHAR(500), -- May differ from customers.name
    
    -- Signature data (raw)
    signature_data JSONB, -- Full signature extraction
    
    -- Metadata
    metadata JSONB,
    
    -- Tracking
    first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uniq_contacts_tenant_email UNIQUE (tenant_id, email)
);

CREATE INDEX idx_contacts_tenant_email ON contacts(tenant_id, email);
CREATE INDEX idx_contacts_company ON contacts(customer_id);
CREATE INDEX idx_contacts_tenant_company ON contacts(tenant_id, customer_id);
```

### 2.3 Email Analysis Table

```sql
CREATE TABLE email_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
    
    -- Sentiment analysis
    sentiment VARCHAR(20), -- 'positive', 'negative', 'neutral'
    sentiment_score DECIMAL(3,2), -- -1.0 to 1.0
    sentiment_by_company BOOLEAN DEFAULT false,
    sentiment_by_person BOOLEAN DEFAULT false,
    
    -- Business signals
    signals JSONB NOT NULL DEFAULT '{}', -- { escalation: boolean, upsell: boolean, churn: boolean, kudos: boolean, competitor: boolean }
    signal_scores JSONB, -- Confidence scores for each signal
    signal_reasons JSONB, -- LLM explanations for signals
    
    -- Analysis metadata
    analysis_model VARCHAR(50), -- 'gpt-4o-mini', 'claude-haiku', etc.
    analysis_version VARCHAR(20), -- Schema version
    analysis_prompt_hash VARCHAR(64), -- Hash of prompt used
    
    -- Context used for analysis
    thread_context JSONB, -- Previous emails in thread used for analysis
    
    -- Tracking
    analyzed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uniq_email_analysis_email UNIQUE (email_id)
);

CREATE INDEX idx_email_analysis_tenant ON email_analysis(tenant_id);
CREATE INDEX idx_email_analysis_thread ON email_analysis(thread_id);
CREATE INDEX idx_email_analysis_signals ON email_analysis USING GIN (signals);
CREATE INDEX idx_email_analysis_sentiment ON email_analysis(tenant_id, sentiment);
```

### 2.4 Tasks Table

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Task source
    source_type VARCHAR(50) NOT NULL, -- 'email_escalation', 'manual', 'workflow'
    source_id UUID, -- email_id, etc.
    
    -- Task information
    title VARCHAR(500) NOT NULL,
    description TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal', -- 'high', 'normal', 'low'
    status VARCHAR(50) NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'completed', 'cancelled'
    
    -- Associations
    customer_id UUID REFERENCES customers(id),
    contact_id UUID REFERENCES contacts(id),
    email_id UUID REFERENCES emails(id),
    thread_id UUID REFERENCES email_threads(id),
    
    -- Assignee
    assigned_to_user_id UUID REFERENCES users(id),
    
    -- Metadata
    metadata JSONB,
    
    -- Tracking
    due_date TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_tenant_status ON tasks(tenant_id, status);
CREATE INDEX idx_tasks_source ON tasks(source_type, source_id);
CREATE INDEX idx_tasks_company ON tasks(customer_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to_user_id);
```

### 2.3 Email Labels Table (for Gmail label tracking)

```sql
CREATE TABLE email_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    
    -- Label information
    label_name VARCHAR(100) NOT NULL, -- 'Escalation', 'Upsell', 'Churn', etc.
    label_source VARCHAR(50) NOT NULL, -- 'analysis', 'manual', 'rule'
    provider_label_id VARCHAR(200), -- Gmail label ID if synced
    
    -- Metadata
    metadata JSONB,
    
    -- Tracking
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uniq_email_labels_email_name UNIQUE (email_id, label_name)
);

CREATE INDEX idx_email_labels_tenant_name ON email_labels(tenant_id, label_name);
CREATE INDEX idx_email_labels_email ON email_labels(email_id);
```

### 2.4 Analysis Configuration Table

```sql
CREATE TABLE analysis_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Enabled analyses
    enabled_analyses JSONB NOT NULL DEFAULT '{
        "sentiment": true,
        "escalation": true,
        "upsell": true,
        "churn": true,
        "kudos": true,
        "competitor": true
    }',
    
    -- Model configuration with fallback
    model_configs JSONB NOT NULL DEFAULT '{
        "sentiment": {
            "primary": "claude-haiku-3.5",
            "fallback": "gpt-4o-mini"
        },
        "signals": {
            "primary": "gpt-4o",
            "fallback": "claude-sonnet-4"
        },
        "signature": {
            "primary": "claude-haiku-3.5",
            "fallback": "gpt-4o-mini"
        }
    }',
    
    -- Analysis-specific settings
    analysis_settings JSONB DEFAULT '{
        "signature": {
            "requireLLMIfRegexFieldsMissing": 2,
            "alwaysUseLLM": false
        },
        "sentiment": {
            "requireThreadContext": false
        },
        "signals": {
            "requireThreadContext": true,
            "minConfidenceThreshold": 0.7
        }
    }',
    
    -- Prompt versions (for Langfuse observability)
    prompt_versions JSONB DEFAULT '{
        "sentiment": "v1.0",
        "escalation": "v1.0",
        "upsell": "v1.0",
        "churn": "v1.0",
        "kudos": "v1.0",
        "competitor": "v1.0",
        "signature": "v1.0"
    }',
    
    -- Custom prompts (optional, overrides defaults)
    custom_prompts JSONB,
    
    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uniq_analysis_config_tenant UNIQUE (tenant_id)
);

CREATE INDEX idx_analysis_configs_tenant ON analysis_configs(tenant_id);
```

**Key Features:**
- **Enabled Analyses**: Per-tenant control over which analyses run
- **Model Configuration**: Primary + fallback models per analysis type
- **Analysis Settings**: Configurable thresholds and behavior
- **Prompt Versions**: Track versions for Langfuse observability
- **Custom Prompts**: Optional tenant-specific prompt overrides

See `ANALYSIS_FRAMEWORK_DESIGN.md` for complete framework details.

---

## 3. Domain Extraction & Company Identification

### 3.1 Domain Extraction Logic

**Algorithm:**
1. Extract all email addresses from `from`, `tos`, `ccs`, `bccs`
2. Parse domain from each email (e.g., `user@subdomain.acme.com` → `acme.com`)
3. Filter out personal email providers (gmail.com, outlook.com, yahoo.com, aol.com, etc.)
4. Extract top-level domain (handle subdomains)
5. Create/update company record

**Domain Extraction Service:**

```typescript
class DomainExtractionService {
  // Personal email providers to exclude
  private readonly PERSONAL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com',
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'yahoo.com', 'ymail.com',
    'aol.com',
    'icloud.com', 'me.com',
    'protonmail.com', 'proton.me',
    'mail.com', 'email.com',
    // Add more as needed
  ]);

  /**
   * Extract top-level domain from email
   * Handles: subdomain.example.com -> example.com
   */
  extractTopLevelDomain(email: string): string | null {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return null;
    
    // Check if personal domain
    if (this.PERSONAL_DOMAINS.has(domain)) {
      return null;
    }
    
    // Extract top-level domain (simple approach - can be enhanced with public suffix list)
    const parts = domain.split('.');
    if (parts.length >= 2) {
      // Return last two parts (e.g., example.com, co.uk)
      return parts.slice(-2).join('.');
    }
    
    return domain;
  }

  /**
   * Extract all unique domains from email
   */
  extractDomains(email: Email): string[] {
    const domains = new Set<string>();
    
    // From sender
    const fromDomain = this.extractTopLevelDomain(email.fromEmail);
    if (fromDomain) domains.add(fromDomain);
    
    // Recipients
    [...(email.tos || []), ...(email.ccs || []), ...(email.bccs || [])]
      .forEach(addr => {
        const domain = this.extractTopLevelDomain(addr.email);
        if (domain) domains.add(domain);
      });
    
    return Array.from(domains);
  }
}
```

**Enhancement: Public Suffix List**

For accurate domain extraction (handling cases like `example.co.uk`), consider using the [Public Suffix List](https://publicsuffix.org/):

```typescript
import { psl } from 'psl';

extractTopLevelDomain(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  
  if (this.PERSONAL_DOMAINS.has(domain)) return null;
  
  // Use Public Suffix List for accurate extraction
  const parsed = psl.parse(domain);
  return parsed.domain || domain;
}
```

### 3.2 Company Identification Service

```typescript
class CompanyIdentificationService {
  async identifyOrCreateCompany(
    tenantId: string,
    domain: string
  ): Promise<Company> {
    // Check if company exists
    let company = await this.companyRepo.findByDomain(tenantId, domain);
    
    if (!company) {
      // Create new company
      company = await this.companyRepo.create({
        tenantId,
        domain,
        domainType: 'business',
        name: this.inferCompanyName(domain), // Can use domain or LLM
      });
    }
    
    return company;
  }
  
  private inferCompanyName(domain: string): string {
    // Simple inference: "acme.com" -> "Acme"
    // Can be enhanced with LLM or domain lookup APIs
    return domain.split('.')[0]
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
```

---

## 4. Contact Extraction & Signature Parsing

### 4.1 Contact Extraction

**Process:**
1. Extract all email addresses from email
2. Check if contact exists (by email)
3. If not, create contact with company association
4. Extract signature from email body
5. Parse signature for additional information

### 4.2 Signature Parsing - LLM/SLM Recommendation

**Recommendation: Use Small Language Model (SLM) for Signature Parsing**

**Why SLM over LLM:**
- **Cost**: SLMs are 10-100x cheaper than LLMs
- **Latency**: SLMs are faster (50-200ms vs 500-2000ms)
- **Task Complexity**: Signature parsing is structured extraction, perfect for SLMs
- **Volume**: High volume of emails makes cost critical

**Model Selection:**
- **Configurable per tenant** via `analysis_configs` table
- **Caller decides** which model and version to use
- **Default recommendations** provided, but tenant can override

**Recommended Models (Defaults):**

1. **Primary: Claude Haiku 3.5** (Anthropic) - `claude-haiku-3.5`
   - Cost: ~$0.25 per 1M input tokens, $1.25 per 1M output tokens
   - Speed: ~100-200ms
   - Quality: Excellent for structured extraction
   - Best for: Production signature parsing

2. **Alternative: GPT-4o-mini** (OpenAI) - `gpt-4o-mini`
   - Cost: ~$0.15 per 1M input tokens, $0.60 per 1M output tokens
   - Speed: ~100-300ms
   - Quality: Good for structured tasks
   - Best for: Cost-sensitive scenarios

3. **Budget: Llama 3.1 8B** (Self-hosted or via API)
   - Cost: ~$0.05-0.10 per 1M tokens (if self-hosted)
   - Speed: ~200-500ms
   - Quality: Good for simple signatures
   - Best for: High-volume, cost-critical scenarios

**Implementation**: Uses Vercel AI SDK with model selection from tenant configuration

**Signature Parsing Service:**

```typescript
class SignatureParsingService {
  constructor(
    private llmClient: LLMClient, // Abstraction for multiple providers
    private contactRepo: ContactRepository
  ) {}

  /**
   * Extract signature from email body
   * Uses regex + LLM hybrid approach for efficiency
   */
  async extractSignature(email: Email): Promise<SignatureData | null> {
    // Step 1: Try regex-based extraction first (fast, free)
    const regexSignature = this.extractSignatureRegex(email.body);
    if (regexSignature && this.isCompleteSignature(regexSignature)) {
      return regexSignature;
    }

    // Step 2: Use SLM for complex signatures
    return await this.extractSignatureLLM(email.body);
  }

  /**
   * Regex-based signature extraction (fast path)
   */
  private extractSignatureRegex(body: string): SignatureData | null {
    // Common signature patterns
    const patterns = {
      phone: /(?:phone|tel|mobile|cell)[\s:]*([+\d\s\-\(\)]+)/i,
      title: /(?:title|position|role)[\s:]*([^\n]+)/i,
      company: /(?:company|organization)[\s:]*([^\n]+)/i,
    };

    // Extract matches
    const phone = body.match(patterns.phone)?.[1]?.trim();
    const title = body.match(patterns.title)?.[1]?.trim();
    const company = body.match(patterns.company)?.[1]?.trim();

    if (phone || title || company) {
      return { phone, title, company };
    }

    return null;
  }

  /**
   * LLM-based signature extraction
   */
  private async extractSignatureLLM(body: string): Promise<SignatureData | null> {
    const prompt = `Extract contact information from this email signature. Return JSON only.

Email body:
${body.substring(body.length - 1000)} // Last 1000 chars (signature usually at end)

Extract:
- name: Full name
- title: Job title
- company: Company name
- phone: Phone number (any format)
- email: Email address (if in signature)
- address: Physical address (if present)

Return JSON:
{
  "name": "...",
  "title": "...",
  "company": "...",
  "phone": "...",
  "email": "...",
  "address": "..."
}`;

    const response = await this.llmClient.complete({
      provider: this.getProviderFromModel(config.models.signature), // 'anthropic' or 'openai'
      model: config.models.signature, // e.g., 'claude-haiku-3.5' or 'gpt-4o-mini'
      messages: [
        { role: 'system', content: 'Extract contact information from email signatures.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      maxTokens: 200,
      responseFormat: 'json',
    });

    return JSON.parse(response.content);
  }
}
```

**Cost Analysis:**
- Average signature: ~500 characters
- Cost per signature (Claude Haiku): ~$0.0001
- 10,000 emails/day: ~$1/day, ~$30/month
- **Recommendation**: Use Claude Haiku 3.5 for production

---

## 5. Email Analysis (Sentiment, Signals)

### 5.1 Analysis Requirements

**Analysis Types:**
1. **Sentiment**: Positive, negative, neutral (by company, by person)
2. **Escalation**: Customer frustration, urgent issues
3. **Upsell**: Interest in additional products/services
4. **Churn**: Cancellation intent, dissatisfaction
5. **Kudos**: Positive feedback, appreciation
6. **Competitor**: Mentions of competitors

**Context Requirements:**
- Analyze email in context of thread
- Consider previous emails in thread
- Track sentiment trends over time

### 5.2 LLM/SLM Recommendation for Email Analysis

**Recommendation: Hybrid Approach**

**For Sentiment Analysis: Use SLM (Configurable)**
- Sentiment is relatively simple classification
- High volume makes cost critical
- SLMs perform well on sentiment tasks
- **Model selection**: Configurable per tenant (default: `claude-haiku-3.5`)
- Cost: ~$0.0001-0.0002 per email

**For Business Signals: Use LLM (Configurable)**
- Business signals require nuanced understanding
- Context from thread is critical
- False positives/negatives have business impact
- **Model selection**: Configurable per tenant (default: `gpt-4o` or `claude-sonnet-4`)
- Cost: ~$0.001-0.003 per email (with thread context)

**Implementation**: Uses Vercel AI SDK - caller specifies model and version via tenant configuration

**Hybrid Strategy:**

```typescript
class EmailAnalysisService {
  /**
   * Analyze email with hybrid approach
   */
  async analyzeEmail(
    email: Email,
    threadEmails: Email[]
  ): Promise<EmailAnalysis> {
    // Step 1: Sentiment analysis (SLM - fast, cheap)
    const sentiment = await this.analyzeSentimentSLM(email, threadEmails);

    // Step 2: Business signals (LLM - accurate, contextual)
    const signals = await this.analyzeSignalsLLM(email, threadEmails);

    return {
      sentiment: sentiment.sentiment,
      sentimentScore: sentiment.score,
      signals,
    };
  }

  /**
   * Sentiment analysis using SLM
   */
  private async analyzeSentimentSLM(
    email: Email,
    threadEmails: Email[]
  ): Promise<{ sentiment: string; score: number }> {
    const context = this.buildThreadContext(threadEmails);
    
    const prompt = `Analyze the sentiment of this email in context of the thread.

Thread context:
${context}

Current email:
Subject: ${email.subject}
Body: ${email.body?.substring(0, 2000)}

Return JSON:
{
  "sentiment": "positive" | "negative" | "neutral",
  "score": -1.0 to 1.0
}`;

    const response = await this.llmClient.complete({
      provider: this.getProviderFromModel(config.models.sentiment), // 'anthropic' or 'openai'
      model: config.models.sentiment, // e.g., 'claude-haiku-3.5' or 'gpt-4o-mini'
      messages: [
        { role: 'system', content: 'You are a sentiment analyzer.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      maxTokens: 100,
      responseFormat: 'json',
    });

    return JSON.parse(response.content);
  }

  /**
   * Business signals analysis using LLM
   */
  private async analyzeSignalsLLM(
    email: Email,
    threadEmails: Email[]
  ): Promise<SignalAnalysis> {
    const context = this.buildThreadContext(threadEmails);
    
    const prompt = `Analyze this email for business signals in context of the thread.

Thread context:
${context}

Current email:
Subject: ${email.subject}
Body: ${email.body?.substring(0, 3000)}

Identify:
1. **Escalation**: Customer frustration, urgent issues, complaints
2. **Upsell**: Interest in additional products/services, expansion
3. **Churn**: Cancellation intent, dissatisfaction, leaving
4. **Kudos**: Positive feedback, appreciation, success stories
5. **Competitor**: Mentions of competitors, comparisons

Return JSON:
{
  "escalation": { "detected": boolean, "confidence": 0.0-1.0, "reason": "..." },
  "upsell": { "detected": boolean, "confidence": 0.0-1.0, "reason": "..." },
  "churn": { "detected": boolean, "confidence": 0.0-1.0, "reason": "..." },
  "kudos": { "detected": boolean, "confidence": 0.0-1.0, "reason": "..." },
  "competitor": { "detected": boolean, "confidence": 0.0-1.0, "reason": "..." }
}`;

    const response = await this.llmClient.complete({
      provider: this.getProviderFromModel(config.models.signals), // 'openai' or 'anthropic'
      model: config.models.signals, // e.g., 'gpt-4o', 'claude-sonnet-4', 'gpt-4o-mini'
      messages: [
        { role: 'system', content: 'You are a business signals analyzer.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      maxTokens: 500,
      responseFormat: 'json',
    });

    return JSON.parse(response.content);
  }

  private buildThreadContext(threadEmails: Email[]): string {
    return threadEmails
      .slice(-5) // Last 5 emails in thread
      .map(e => `[${e.receivedAt}] ${e.fromName || e.fromEmail}: ${e.subject}\n${e.body?.substring(0, 500)}`)
      .join('\n\n---\n\n');
  }
}
```

**Cost Analysis:**

**Per Email Analysis:**
- Sentiment (SLM): ~$0.0001
- Signals (LLM): ~$0.002
- **Total: ~$0.0021 per email**

**Monthly Costs (10,000 emails/day):**
- Sentiment: ~$30/month
- Signals: ~$600/month
- **Total: ~$630/month**

**Optimization Strategies:**
1. **Batch Processing**: Analyze multiple emails in single LLM call
2. **Caching**: Cache similar emails (hash-based)
3. **Selective Analysis**: Only analyze emails from business domains
4. **Confidence Thresholds**: Skip low-confidence signals

---

## 6. Processing Pipeline

### 6.1 Pipeline Architecture

**Design: Event-Driven with Independent Sub-Workflows (Inngest)**

**Execution Strategy:**
- **Always Run** (synchronous): Domain extraction, Contact extraction
- **Conditional** (async, independent): Signature parsing (if needed), Other analyses (if enabled)

```
Email Inserted
    │
    ▼
┌─────────────────┐
│  Inngest Event  │ (email/inserted)
│  email/inserted │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│     Main Orchestrator Function      │
│     (analyze-email)                 │
│                                     │
│  Step 1: Domain Extraction (sync)  │
│  Step 2: Contact Extraction (sync) │
│  Step 3: Signature Check (conditional)│
│  Step 4: Send Events for Enabled    │
│          Analyses (parallel)        │
└────────┬────────────────────────────┘
         │
         ├─► Always: Domain Extraction → Update customers
         ├─► Always: Contact Extraction → Update contacts
         ├─► Conditional: Signature Parsing (if needed) → Update contacts.signature_data
         ├─► Conditional: Sentiment Analysis (if enabled) → Update email_analysis.sentiment
         ├─► Conditional: Escalation Detection (if enabled) → Update email_analysis.signals.escalation + Create Task
         ├─► Conditional: Upsell Detection (if enabled) → Update email_analysis.signals.upsell
         ├─► Conditional: Churn Detection (if enabled) → Update email_analysis.signals.churn
         ├─► Conditional: Kudos Detection (if enabled) → Update email_analysis.signals.kudos
         └─► Conditional: Competitor Detection (if enabled) → Update email_analysis.signals.competitor

Each analysis runs as independent Inngest function (parallel, non-blocking)
```

### 6.2 Implementation

**Inngest Function Setup:**

```typescript
// apps/api/src/emails/functions.ts
import { inngest } from '../inngest/client';
import { EmailAnalysisPipeline } from './analysis-pipeline';

export const analyzeEmail = inngest.createFunction(
  {
    id: 'analyze-email',
    name: 'Analyze Email',
    rateLimit: {
      limit: 10, // 10 emails per minute per tenant
      period: '1m',
      key: 'event.data.tenantId', // Per-tenant rate limiting
    },
  },
  { event: 'email/inserted' },
  async ({ event, step }) => {
    const { emailId, tenantId, threadId } = event.data;

    // Run analysis pipeline with step-by-step visibility
    return await step.run('analyze-email-pipeline', async () => {
      const pipeline = new EmailAnalysisPipeline();
      return await pipeline.process(emailId, tenantId, threadId);
    });
  }
);
```

**Main Orchestrator Function (Independent Sub-Workflows):**

```typescript
// apps/api/src/emails/functions.ts
import { inngest } from '../inngest/client';
import { getAnalysisConfig } from '../analysis/config-service';

export const analyzeEmail = inngest.createFunction(
  {
    id: 'analyze-email',
    name: 'Analyze Email (Orchestrator)',
    rateLimit: {
      limit: 10,
      period: '1m',
      key: 'event.data.tenantId',
    },
  },
  { event: 'email/inserted' },
  async ({ event, step }) => {
    const { emailId, tenantId, threadId } = event.data;
    const traceId = `email-analysis-${emailId}-${Date.now()}`;

    // Step 1: Always run - Domain extraction (synchronous)
    await step.run('domain-extraction', async () => {
      await inngest.send({
        name: 'analysis/domain.extract',
        data: { emailId, tenantId, traceId },
      });
    });

    // Step 2: Always run - Contact extraction (synchronous)
    await step.run('contact-extraction', async () => {
      await inngest.send({
        name: 'analysis/contact.extract',
        data: { emailId, tenantId, traceId },
      });
    });

    // Step 3: Conditional - Signature parsing (if needed)
    const needsSignature = await step.run('signature-check', async () => {
      return await checkSignatureNeeded(emailId, tenantId);
    });

    if (needsSignature) {
      await step.sendEvent('parse-signature', {
        name: 'analysis/signature.parse',
        data: { emailId, tenantId, traceId },
      });
    }

    // Step 4-N: Conditional analyses (independent, parallel)
    const config = await step.run('get-config', async () => {
      return await getAnalysisConfig(tenantId);
    });

    // Send events for all enabled analyses (they run independently)
    const analysisEvents = Object.entries(config.enabledAnalyses)
      .filter(([_, enabled]) => enabled)
      .map(([type, _]) => ({
        name: `analysis/${type}` as const,
        data: { emailId, tenantId, threadId, traceId },
      }));

    if (analysisEvents.length > 0) {
      await step.sendEvent('trigger-analyses', analysisEvents);
    }

    return { emailId, traceId };
  }
);

/**
 * Individual analysis function (example: sentiment)
 */
export const analyzeSentiment = inngest.createFunction(
  {
    id: 'analyze-sentiment',
    name: 'Analyze Email Sentiment',
  },
  { event: 'analysis/sentiment' },
  async ({ event, step }) => {
    const { emailId, tenantId, threadId, traceId } = event.data;

    // Step 1: Get config
    const config = await step.run('get-config', async () => {
      return await getAnalysisConfig(tenantId);
    });

    // Step 2: Execute analysis
    const result = await step.run('execute-analysis', async () => {
      const executor = container.resolve(AnalysisExecutor);
      const definition = analysisRegistry.get('sentiment');
      const email = await emailClient.getEmail(tenantId, emailId);
      const threadContext = threadId ? await buildThreadContext(tenantId, threadId) : null;

      return await executor.execute(
        definition!,
        email,
        threadContext,
        config,
        { traceId, userId: tenantId }
      );
    });

    // Step 3: Save result (independent update)
    await step.run('save-result', async () => {
      return await emailClient.saveAnalysis(tenantId, emailId, {
        sentiment: result.sentiment,
        sentimentScore: result.score,
      });
    });

    return result;
  }
);

// Similar functions for: escalation, upsell, churn, kudos, competitor
// Each runs independently, updates API independently, non-blocking
```

**Triggering Analysis:**

```typescript
// In EmailService.bulkInsertWithThreads
import { inngest } from '../inngest/client';

async bulkInsertWithThreads(...) {
  // ... existing insertion logic ...
  
  // Send events to Inngest for analysis (async, non-blocking)
  const events = insertedEmails.map(email => ({
    name: 'email/inserted' as const,
    data: {
      emailId: email.id,
      tenantId,
      threadId: email.threadId,
    },
  }));

  // Batch send events (more efficient)
  if (events.length > 0) {
    await inngest.send(events);
  }
  
  return result;
}
```

---

## 7. Task Creation

### 7.1 Task Creation Logic

**When to Create Tasks:**
- Escalation detected (high confidence)
- Churn risk detected (high confidence)
- Manual trigger from UI

**Task Service:**

```typescript
class TaskService {
  async createFromEmail(
    email: Email,
    analysis: EmailAnalysis
  ): Promise<Task> {
    // Determine priority
    const priority = this.determinePriority(analysis);
    
    // Get company and contact
    const company = await this.companyService.findByEmailDomain(
      email.tenantId,
      this.domainExtractor.extractTopLevelDomain(email.fromEmail)
    );
    const contact = await this.contactService.findByEmail(
      email.tenantId,
      email.fromEmail
    );

    // Create task
    const task = await this.taskRepo.create({
      tenantId: email.tenantId,
      sourceType: 'email_escalation',
      sourceId: email.id,
      title: `Escalation: ${email.subject}`,
      description: this.buildTaskDescription(email, analysis),
      priority,
      status: 'open',
      customerId: company?.id,
      contactId: contact?.id,
      emailId: email.id,
      threadId: email.threadId,
      metadata: {
        escalationReason: analysis.signals.escalation.reason,
        confidence: analysis.signals.escalation.confidence,
      },
    });

    return task;
  }

  private determinePriority(analysis: EmailAnalysis): string {
    if (analysis.signals.escalation.confidence > 0.8) return 'high';
    if (analysis.signals.churn.detected) return 'high';
    return 'normal';
  }

  private buildTaskDescription(
    email: Email,
    analysis: EmailAnalysis
  ): string {
    return `
Email from: ${email.fromName || email.fromEmail}
Subject: ${email.subject}

Escalation Reason: ${analysis.signals.escalation.reason}
Confidence: ${(analysis.signals.escalation.confidence * 100).toFixed(0)}%

Email Preview:
${email.body?.substring(0, 500)}...
    `.trim();
  }
}
```

---

## 8. Label Attachment

### 8.1 Label Mapping

**Labels to Attach:**
- `Escalation` - When escalation detected
- `Upsell` - When upsell opportunity detected
- `Churn Risk` - When churn detected
- `Kudos` - When positive feedback detected
- `Competitor` - When competitor mentioned

### 8.2 Label Service

```typescript
class LabelService {
  /**
   * Attach labels to email based on analysis
   */
  async attachLabels(
    email: Email,
    analysis: EmailAnalysis
  ): Promise<void> {
    const labels: string[] = [];

    // Map signals to labels
    if (analysis.signals.escalation.detected && analysis.signals.escalation.confidence > 0.7) {
      labels.push('Escalation');
    }
    if (analysis.signals.upsell.detected && analysis.signals.upsell.confidence > 0.7) {
      labels.push('Upsell');
    }
    if (analysis.signals.churn.detected && analysis.signals.churn.confidence > 0.7) {
      labels.push('Churn Risk');
    }
    if (analysis.signals.kudos.detected && analysis.signals.kudos.confidence > 0.7) {
      labels.push('Kudos');
    }
    if (analysis.signals.competitor.detected && analysis.signals.competitor.confidence > 0.7) {
      labels.push('Competitor');
    }

    // Store labels in database
    for (const labelName of labels) {
      await this.labelRepo.create({
        tenantId: email.tenantId,
        emailId: email.id,
        labelName,
        labelSource: 'analysis',
      });
    }

    // Attach labels to Gmail (if Gmail provider)
    if (email.provider === 'gmail') {
      await this.attachGmailLabels(email, labels);
    }
  }

  /**
   * Attach labels to Gmail message
   */
  private async attachGmailLabels(
    email: Email,
    labels: string[]
  ): Promise<void> {
    // Get Gmail integration
    const integration = await this.integrationService.getByTenantAndSource(
      email.tenantId,
      'gmail'
    );

    // Get or create Gmail labels
    const gmailLabelIds = await Promise.all(
      labels.map(label => this.getOrCreateGmailLabel(integration, label))
    );

    // Attach labels to message
    await this.gmailService.modifyMessage(
      email.tenantId,
      email.messageId,
      { addLabelIds: gmailLabelIds }
    );
  }

  /**
   * Get or create Gmail label
   */
  private async getOrCreateGmailLabel(
    integration: Integration,
    labelName: string
  ): Promise<string> {
    // Check if label exists in cache/database
    let labelId = await this.labelCache.get(`gmail:${integration.id}:${labelName}`);
    
    if (!labelId) {
      // Create label in Gmail
      const label = await this.gmailService.createLabel(
        integration.tenantId,
        {
          name: `CRM/${labelName}`,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        }
      );
      
      labelId = label.id!;
      await this.labelCache.set(`gmail:${integration.id}:${labelName}`, labelId);
    }
    
    return labelId;
  }
}
```

---

## 9. Security Considerations

### 9.1 Data Privacy

1. **Email Content Encryption**
   - Encrypt sensitive email bodies at rest
   - Use tenant-specific encryption keys
   - Implement field-level encryption for PII

2. **Access Control**
   - Tenant isolation (all queries scoped by tenant_id)
   - Role-based access control (RBAC)
   - Audit logging for all analysis operations

3. **LLM Data Handling**
   - **Never send PII to LLM**: Strip email addresses, phone numbers before sending
   - Use data anonymization: Replace names with placeholders
   - Consider on-premise LLM options for sensitive data

### 9.2 Implementation

```typescript
class SecureAnalysisService {
  /**
   * Sanitize email content before sending to LLM
   */
  private sanitizeForLLM(email: Email): SanitizedEmail {
    return {
      subject: this.redactPII(email.subject),
      body: this.redactPII(email.body || ''),
      // Remove email addresses, phone numbers
    };
  }

  private redactPII(text: string): string {
    // Remove email addresses
    text = text.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]');
    
    // Remove phone numbers
    text = text.replace(/[\d\s\-\(\)\+]{10,}/g, '[PHONE]');
    
    // Remove URLs (optional)
    // text = text.replace(/https?:\/\/[^\s]+/g, '[URL]');
    
    return text;
  }
}
```

### 9.3 API Security

- Rate limiting on analysis endpoints
- API key authentication for internal services
- Inngest event signing (built-in)
- Timeout handling for LLM calls
- Per-tenant rate limiting via Inngest rate limits

### 9.4 Observability with Langfuse

**LLM Observability:**
- Automatic tracing of all LLM calls via Langfuse
- Cost tracking per tenant/model
- Performance monitoring (latency, tokens, errors)
- Debugging capabilities (exact prompts/responses)
- Model comparison analytics

**Integration:**
- Langfuse integrated into LLM service
- Traces linked to Inngest function executions
- Per-tenant cost tracking and analytics
- Self-hostable option available

See `LANGFUSE_OBSERVABILITY.md` for detailed implementation.

---

## 10. Cost Optimization

### 10.1 Cost Breakdown (Monthly, 10,000 emails/day)

| Component | Model (Default) | Cost/Email | Monthly Cost |
|-----------|----------------|------------|--------------|
| Signature Parsing | Claude Haiku 3.5 (configurable) | $0.0001 | $30 |
| Sentiment Analysis | Claude Haiku 3.5 (configurable) | $0.0001 | $30 |
| Business Signals | GPT-4o (configurable) | $0.002 | $600 |
| **Total** | | | **$660/month** |

**Note**: Models are configurable per tenant via `analysis_configs` table. Tenants can choose different models/versions based on their needs and budget.

### 10.2 Optimization Strategies

1. **Selective Analysis**
   - Only analyze emails from business domains
   - Skip personal email providers entirely
   - Skip internal emails (same domain as tenant)

2. **Batch Processing**
   - Batch multiple emails in single LLM call
   - Use streaming for faster responses
   - Cache similar emails

3. **Confidence Thresholds**
   - Skip low-confidence signals
   - Only create tasks for high-confidence escalations
   - Use cheaper models for simple cases

4. **Caching**
   - Cache analysis results for similar emails
   - Use semantic similarity (embeddings) to find similar emails
   - Cache thread context

5. **Model Selection**
   - Use SLM for simple tasks (sentiment, signature)
   - Use LLM only for complex tasks (business signals)
   - Consider fine-tuned models for specific use cases

### 10.3 Cost Monitoring

```typescript
class CostTrackingService {
  async trackLLMCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    const cost = this.calculateCost(model, inputTokens, outputTokens);
    
    await this.costRepo.record({
      model,
      inputTokens,
      outputTokens,
      cost,
      timestamp: new Date(),
    });
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    // Pricing for common models (supports any model via Vercel AI SDK)
    const pricing: Record<string, { input: number; output: number }> = {
      // Anthropic models
      'claude-haiku-3.5': { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
      'claude-sonnet-4': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
      'claude-opus-4': { input: 15.00 / 1_000_000, output: 75.00 / 1_000_000 },
      // OpenAI models
      'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
      'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
      'gpt-4-turbo': { input: 10.00 / 1_000_000, output: 30.00 / 1_000_000 },
      // Add more models as needed
    };

    const rates = pricing[model];
    if (!rates) {
      // Default to GPT-4o pricing if model not found
      return (inputTokens * 2.50 / 1_000_000) + (outputTokens * 10.00 / 1_000_000);
    }
    return (inputTokens * rates.input) + (outputTokens * rates.output);
  }
}
```

---

## 11. Performance Optimization

### 11.1 Processing Speed

**Targets:**
- Email analysis: < 5 seconds per email
- Signature parsing: < 1 second per email
- Inngest processing: 100+ emails/minute (configurable)

**Optimizations:**

1. **Parallel Processing**
   - Inngest handles concurrency automatically
   - Use step functions for parallel operations
   - Batch database operations

2. **Async Operations**
   - Signature parsing via separate Inngest function (non-blocking)
   - Label attachment can be async
   - Task creation can be async

3. **Caching**
   - Cache company lookups
   - Cache contact lookups
   - Cache thread context

4. **Database Optimization**
   - Use indexes on all lookup fields
   - Batch inserts for labels
   - Use connection pooling

5. **Inngest Optimizations**
   - Use step functions for visibility and retries
   - Configure per-tenant rate limits
   - Use batch event sending

### 11.2 Scalability

**Horizontal Scaling:**
- Inngest functions scale automatically (serverless)
- No need for worker management
- Use database connection pooling

**Vertical Scaling:**
- Increase Inngest function concurrency limits
- Use faster LLM models (with higher cost)
- Increase database resources

**Inngest Configuration:**
```typescript
export const analyzeEmail = inngest.createFunction(
  {
    id: 'analyze-email',
    concurrency: {
      limit: 10, // Process 10 emails concurrently
      key: 'event.data.tenantId', // Per-tenant concurrency
    },
  },
  { event: 'email/inserted' },
  async ({ event, step }) => {
    // ... analysis logic
  }
);
```

---

## 12. Extensibility

### 12.1 Plugin Architecture

**Design for Future Features:**

```typescript
interface AnalysisPlugin {
  name: string;
  version: string;
  
  // Analyze email
  analyze(email: Email, context: AnalysisContext): Promise<AnalysisResult>;
  
  // Priority (higher = runs first)
  priority: number;
}

class AnalysisPluginManager {
  private plugins: AnalysisPlugin[] = [];

  register(plugin: AnalysisPlugin): void {
    this.plugins.push(plugin);
    this.plugins.sort((a, b) => b.priority - a.priority);
  }

  async runAll(email: Email, context: AnalysisContext): Promise<AnalysisResult[]> {
    return Promise.all(
      this.plugins.map(plugin => plugin.analyze(email, context))
    );
  }
}
```

### 12.2 Future Use Cases

**Auto-Response System:**
- Analyze email intent
- Generate response using LLM
- Review before sending (human-in-the-loop)
- Learn from corrections

**Workflow Automation:**
- Trigger workflows based on signals
- Create tasks automatically
- Assign to team members
- Escalate based on rules

**Analytics & Reporting:**
- Sentiment trends over time
- Escalation patterns
- Customer health scores
- Team performance metrics

---

## 13. Implementation Plan

### Phase 1: Foundation (Week 1-2)
1. Create database schemas (customers, contacts, email_analysis, tasks, email_labels)
2. Implement domain extraction service
3. Implement company identification service
4. Implement contact extraction service
5. Set up Inngest client and basic function structure

### Phase 2: Signature Parsing (Week 2-3)
1. Implement regex-based signature extraction
2. Integrate Claude Haiku for signature parsing
3. Create Inngest function for signature parsing
4. Test and optimize signature extraction

### Phase 3: Email Analysis (Week 3-4)
1. Implement sentiment analysis (SLM)
2. Implement business signals analysis (LLM)
3. Create Inngest function for email analysis with step functions
4. Integrate event triggering from EmailService

### Phase 4: Task & Labels (Week 4-5)
1. Implement task creation service
2. Implement label attachment service
3. Integrate with Gmail API for labels
4. Add task creation step to Inngest function

### Phase 5: Testing & Optimization (Week 5-6)
1. Load testing with Inngest dashboard monitoring
2. Cost optimization (monitor Inngest event usage)
3. Performance tuning (optimize step functions)
4. Security audit
5. Set up Inngest observability and alerts

---

## 14. Inngest Setup

### 14.1 Inngest Client Configuration

```typescript
// apps/api/src/inngest/client.ts
import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'crm-api',
  eventKey: process.env.INNGEST_EVENT_KEY,
});

// Register all functions
import { analyzeEmail, parseSignature } from '../emails/functions';

export const inngestFunctions = [
  analyzeEmail,
  parseSignature,
];
```

### 14.2 Inngest Server Endpoint

```typescript
// apps/api/src/routes/inngest.ts
import { serve } from 'inngest/hono';
import { inngest, inngestFunctions } from '../inngest/client';

export const inngestRoutes = serve({
  client: inngest,
  functions: inngestFunctions,
});
```

### 14.3 Environment Variables

```bash
# Inngest configuration
INNGEST_EVENT_KEY=your-event-key
INNGEST_SIGNING_KEY=your-signing-key  # For webhook verification
INNGEST_BASE_URL=https://api.inngest.com  # Or self-hosted URL
```

### 14.4 Benefits of Inngest for This Use Case

1. **Observability**: Built-in dashboard shows each step execution
2. **Retries**: Automatic retries with exponential backoff per step
3. **Rate Limiting**: Built-in per-tenant rate limiting
4. **Event-Driven**: Natural fit for email events
5. **Cost**: Free tier (25K events/month) + $0.20 per 1K events
6. **Already Integrated**: Gmail service already uses Inngest

### 14.5 Langfuse Observability

**Integration:**
- Langfuse traces all LLM calls automatically
- Links to Inngest traces for full visibility
- Cost tracking per tenant/model
- Performance monitoring and debugging

**Setup:**
```bash
# Environment variables
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # Or self-hosted
LANGFUSE_ENABLED=true
```

**Benefits:**
- See every LLM call with prompts/responses
- Track costs per tenant
- Debug issues quickly
- Compare model performance
- Set up alerts

See `LANGFUSE_OBSERVABILITY.md` for detailed integration guide.

---

## 15. Recommendations Summary

### LLM/SLM Selection

| Task | Default Model | Configurable | Rationale |
|------|--------------|--------------|-----------|
| Signature Parsing | Claude Haiku 3.5 | ✅ Yes (per tenant) | Cost-effective, fast, accurate |
| Sentiment Analysis | Claude Haiku 3.5 | ✅ Yes (per tenant) | Simple classification, high volume |
| Business Signals | GPT-4o | ✅ Yes (per tenant) | Complex reasoning, context-dependent |

**Implementation**: Uses Vercel AI SDK - models are specified in tenant's `analysis_configs` table. Caller can choose any supported model and version (e.g., `claude-haiku-3.5`, `gpt-4o-mini`, `gpt-4o`, `claude-sonnet-4`).

### Architecture Decisions

1. **Event-Driven Processing**: Use Inngest for async processing (already integrated)
2. **Hybrid LLM Approach**: SLM for simple tasks, LLM for complex tasks
3. **Step Functions**: Use Inngest step functions for visibility and retries
4. **Plugin Architecture**: Design for extensibility via Inngest events
5. **LLM Observability**: Use Langfuse for comprehensive LLM tracing and monitoring
6. **Model Selection**: Caller-configurable models via tenant configuration
7. **LLM Abstraction**: Use Vercel AI SDK for provider-agnostic LLM calls

### Security

1. **PII Redaction**: Strip PII before sending to LLM
2. **Tenant Isolation**: All queries scoped by tenant_id
3. **Encryption**: Encrypt sensitive data at rest
4. **Audit Logging**: Log all analysis operations

### Cost Management

1. **Selective Analysis**: Only analyze business emails
2. **Batch Processing**: Batch multiple emails
3. **Caching**: Cache similar emails
4. **Monitoring**: Track costs per tenant/model

---

## 16. Open Questions

1. **Domain Extraction**: Should we use Public Suffix List library?
2. **Signature Parsing**: Should we use self-hosted Llama for cost savings?
3. **Analysis Frequency**: Should we re-analyze emails when thread updates?
4. **Label Management**: Should labels be tenant-specific or global?
5. **Task Assignment**: How should tasks be assigned to team members?

---

## 17. Appendix: Example Prompts

### Signature Parsing Prompt

```
Extract contact information from this email signature. Return JSON only.

Email body:
[Last 1000 characters of email]

Extract:
- name: Full name
- title: Job title
- company: Company name
- phone: Phone number (any format)
- email: Email address (if in signature)
- address: Physical address (if present)

Return JSON:
{
  "name": "...",
  "title": "...",
  "company": "...",
  "phone": "...",
  "email": "...",
  "address": "..."
}
```

### Sentiment Analysis Prompt

```
Analyze the sentiment of this email in context of the thread.

Thread context:
[Last 5 emails in thread]

Current email:
Subject: [subject]
Body: [body - first 2000 chars]

Return JSON:
{
  "sentiment": "positive" | "negative" | "neutral",
  "score": -1.0 to 1.0
}
```

### Business Signals Prompt

```
Analyze this email for business signals in context of the thread.

Thread context:
[Last 5 emails in thread]

Current email:
Subject: [subject]
Body: [body - first 3000 chars]

Identify:
1. **Escalation**: Customer frustration, urgent issues, complaints
2. **Upsell**: Interest in additional products/services, expansion
3. **Churn**: Cancellation intent, dissatisfaction, leaving
4. **Kudos**: Positive feedback, appreciation, success stories
5. **Competitor**: Mentions of competitors, comparisons

Return JSON:
{
  "escalation": { "detected": boolean, "confidence": 0.0-1.0, "reason": "..." },
  "upsell": { "detected": boolean, "confidence": 0.0-1.0, "reason": "..." },
  "churn": { "detected": boolean, "confidence": 0.0-1.0, "reason": "..." },
  "kudos": { "detected": boolean, "confidence": 0.0-1.0, "reason": "..." },
  "competitor": { "detected": boolean, "confidence": 0.0-1.0, "reason": "..." }
}
```
