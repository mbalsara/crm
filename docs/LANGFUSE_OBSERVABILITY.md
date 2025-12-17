# Langfuse Observability Integration

## Overview

Langfuse provides comprehensive observability for LLM applications, including tracing, monitoring, cost tracking, and debugging. This document outlines how Langfuse is integrated into the email analysis system.

---

## Why Langfuse?

1. **Open Source**: Self-hostable, no vendor lock-in
2. **Comprehensive Tracing**: Track every LLM call with full context
3. **Cost Tracking**: Automatic cost calculation per model/tenant
4. **Performance Monitoring**: Latency, token usage, error rates
5. **Debugging**: See exact prompts, responses, and errors
6. **Analytics**: Model comparison, prompt performance, user analytics
7. **Vercel AI SDK Integration**: Native integration with Vercel AI SDK

---

## Architecture

```
Email Analysis Request
    │
    ▼
┌─────────────────┐
│  Langfuse Trace │ (Top-level trace)
│  (email-analysis)│
└────────┬────────┘
         │
         ├─► Generation: Sentiment Analysis
         │   └─► Model: claude-haiku-3.5
         │   └─► Input: Email + Thread Context
         │   └─► Output: Sentiment JSON
         │   └─► Cost: $0.0001
         │
         ├─► Generation: Signature Parsing
         │   └─► Model: claude-haiku-3.5
         │   └─► Input: Email Body
         │   └─► Output: Signature JSON
         │   └─► Cost: $0.0001
         │
         └─► Generation: Business Signals
             └─► Model: gpt-4o
             └─► Input: Email + Thread Context
             └─► Output: Signals JSON
             └─► Cost: $0.002
```

---

## Implementation

### 1. Installation

```bash
pnpm add langfuse
```

### 2. Environment Variables

```bash
# Langfuse configuration
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # Or self-hosted URL
LANGFUSE_ENABLED=true  # Feature flag
```

### 3. LLM Service Integration

```typescript
// packages/shared/src/llm/client.ts

import { Langfuse } from 'langfuse';
import { generateText } from 'ai';

@injectable()
export class LLMService {
  private langfuse: Langfuse | null = null;

  constructor() {
    if (process.env.LANGFUSE_ENABLED === 'true' && 
        process.env.LANGFUSE_SECRET_KEY) {
      this.langfuse = new Langfuse({
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
      });
    }
  }

  async complete(options: LLMCompletionOptions & {
    traceId?: string;
    userId?: string;
    metadata?: Record<string, any>;
  }): Promise<LLMCompletionResponse> {
    const model = this.getModel(options.provider, options.model);

    // Create Langfuse trace
    const trace = this.langfuse?.trace({
      id: options.traceId,
      userId: options.userId,
      name: 'llm-completion',
      metadata: {
        provider: options.provider,
        model: options.model,
        ...options.metadata,
      },
    });

    const generation = trace?.generation({
      name: options.metadata?.analysisType || 'llm-call',
      model: options.model,
      modelParameters: {
        temperature: options.temperature ?? 0,
        maxTokens: options.maxTokens,
      },
      input: options.messages,
    });

    try {
      const result = await generateText({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0,
        maxTokens: options.maxTokens,
        ...(options.responseFormat === 'json' && {
          responseFormat: { type: 'json_object' },
        }),
      });

      // Log successful completion
      generation?.end({
        output: result.text,
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
        },
        metadata: {
          finishReason: result.finishReason,
          modelId: result.modelId,
        },
      });

      return {
        content: result.text,
        model: result.modelId,
        usage: result.usage,
        finishReason: result.finishReason,
      };
    } catch (error: any) {
      // Log error
      generation?.end({
        level: 'ERROR',
        statusMessage: error.message,
        metadata: { error: error.toString() },
      });
      throw error;
    }
  }
}
```

### 4. Analysis Service Integration

```typescript
// apps/analysis/src/services/email-analysis.ts

@injectable()
export class EmailAnalysisService {
  async analyze(params: {
    emailId: string;
    tenantId: string;
    threadId: string;
    config: AnalysisConfig;
  }): Promise<EmailAnalysis> {
    const { emailId, tenantId, threadId, config } = params;

    // Create top-level trace for entire analysis
    const traceId = `email-analysis-${emailId}-${Date.now()}`;
    const langfuse = this.getLangfuse();

    const trace = langfuse?.trace({
      id: traceId,
      userId: tenantId,
      name: 'email-analysis',
      metadata: {
        emailId,
        threadId,
        tenantId,
        enabledAnalyses: Object.entries(config.enabledAnalyses)
          .filter(([_, enabled]) => enabled)
          .map(([analysis]) => analysis),
      },
    });

    try {
      // Step 1: Domain extraction
      const domains = await this.stepWithTrace(trace, 'domain-extraction', async () => {
        return this.domainExtractor.extractDomains(email);
      });

      // Step 2: Company identification
      const customers = await this.stepWithTrace(trace, 'company-identification', async () => {
        return Promise.all(
          domains.map(d => this.companyService.identifyOrCreateCompany(tenantId, d))
        );
      });

      // Step 3: Contact extraction
      const contacts = await this.stepWithTrace(trace, 'contact-extraction', async () => {
        return this.contactService.extractContacts(email, customers);
      });

      // Step 4: Sentiment analysis (with LLM trace)
      let sentiment;
      if (config.enabledAnalyses.sentiment) {
        sentiment = await this.analyzeSentiment(email, threadEmails, config, {
          traceId,
          userId: tenantId,
        });
      }

      // Step 5: Business signals (with LLM trace)
      let signals;
      if (config.enabledAnalyses.escalation || 
          config.enabledAnalyses.upsell || 
          config.enabledAnalyses.churn ||
          config.enabledAnalyses.kudos ||
          config.enabledAnalyses.competitor) {
        signals = await this.analyzeSignals(email, threadEmails, config, {
          traceId,
          userId: tenantId,
        });
      }

      // End trace successfully
      trace?.update({
        output: { sentiment, signals },
        metadata: { completed: true },
      });

      return { sentiment, signals };
    } catch (error: any) {
      // End trace with error
      trace?.update({
        level: 'ERROR',
        statusMessage: error.message,
        metadata: { error: error.toString() },
      });
      throw error;
    }
  }

  private async stepWithTrace<T>(
    trace: any,
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const span = trace?.span({
      name: stepName,
    });

    try {
      const result = await fn();
      span?.end({ output: result });
      return result;
    } catch (error: any) {
      span?.end({
        level: 'ERROR',
        statusMessage: error.message,
      });
      throw error;
    }
  }
}
```

---

## Observability Features

### 1. Trace Hierarchy

```
Trace: email-analysis-{emailId}
├─ Span: domain-extraction
├─ Span: company-identification
├─ Span: contact-extraction
├─ Generation: sentiment-analysis
│  ├─ Model: claude-haiku-3.5
│  ├─ Input: [messages]
│  ├─ Output: { sentiment: "positive", score: 0.8 }
│  ├─ Usage: { promptTokens: 150, completionTokens: 20 }
│  └─ Cost: $0.0001
└─ Generation: business-signals
   ├─ Model: gpt-4o
   ├─ Input: [messages]
   ├─ Output: { escalation: {...}, upsell: {...} }
   ├─ Usage: { promptTokens: 2000, completionTokens: 300 }
   └─ Cost: $0.002
```

### 2. Cost Tracking

**Per-Tenant Costs:**
- Langfuse automatically calculates costs based on model pricing
- Track costs per tenant, per analysis type, per model
- Set up alerts for cost thresholds

**Cost Dashboard:**
- Total cost per tenant
- Cost breakdown by model
- Cost trends over time
- Cost per email (average)

### 3. Performance Monitoring

**Metrics Tracked:**
- Latency per LLM call
- Token usage (input/output)
- Error rates
- Model performance comparison
- Prompt performance

**Dashboards:**
- Average latency by model
- Token usage trends
- Error rate by model/tenant
- P95/P99 latency

### 4. Debugging

**What You Can See:**
- Exact prompts sent to LLM
- Full responses received
- Error messages and stack traces
- Model parameters used
- Thread context included

**Use Cases:**
- Debug why sentiment analysis failed
- See why escalation wasn't detected
- Compare model outputs side-by-side
- Understand token usage patterns

### 5. Analytics

**Model Comparison:**
- Compare `gpt-4o` vs `claude-sonnet-4` for signals
- Compare `claude-haiku-3.5` vs `gpt-4o-mini` for sentiment
- Cost vs quality trade-offs

**Prompt Performance:**
- Which prompts work best?
- A/B test different prompt variations
- Track prompt effectiveness over time

**User Analytics:**
- Which tenants use which models?
- Cost per tenant
- Analysis success rates

---

## Configuration

### Self-Hosted Langfuse

```bash
# Option 1: Docker Compose
git clone https://github.com/langfuse/langfuse
cd langfuse
docker-compose up -d

# Option 2: Cloud Langfuse
# Sign up at https://cloud.langfuse.com
```

### Environment Setup

```bash
# For self-hosted
LANGFUSE_BASE_URL=http://localhost:3000
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_PUBLIC_KEY=pk-...

# For cloud
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_PUBLIC_KEY=pk-...
```

---

## Benefits

1. **Full Visibility**: See every LLM call with context
2. **Cost Control**: Track and optimize costs per tenant
3. **Debugging**: Quickly identify issues with prompts/models
4. **Optimization**: Compare models and prompts
5. **Compliance**: Audit trail of all LLM usage
6. **Alerting**: Set up alerts for errors, costs, latency

---

## Example Trace View

In Langfuse dashboard, you'll see:

```
📧 Email Analysis: email-analysis-abc123
├─ ⏱️ Duration: 2.3s
├─ 💰 Cost: $0.0021
├─ 📊 Steps:
│  ├─ Domain Extraction (50ms)
│  ├─ Company Identification (100ms)
│  ├─ Contact Extraction (80ms)
│  ├─ Sentiment Analysis (200ms) - claude-haiku-3.5
│  │  └─ 💵 $0.0001 | 📝 150/20 tokens
│  └─ Business Signals (1800ms) - gpt-4o
│     └─ 💵 $0.002 | 📝 2000/300 tokens
└─ ✅ Success
```

---

## Integration with Inngest

```typescript
// Inngest function with Langfuse tracing
export const analyzeEmail = inngest.createFunction(
  { id: 'analyze-email' },
  { event: 'email/inserted' },
  async ({ event, step }) => {
    const { emailId, tenantId, threadId } = event.data;
    const traceId = `inngest-${event.id}`;

    return await step.run('analyze-email-pipeline', async () => {
      const pipeline = new EmailAnalysisPipeline();
      return await pipeline.process(emailId, tenantId, threadId, {
        traceId, // Pass trace ID for Langfuse
        userId: tenantId,
      });
    });
  }
);
```

---

## Cost Tracking Example

```typescript
// Langfuse automatically tracks costs
// You can query via API or dashboard

// Per-tenant cost query
const tenantCosts = await langfuse.observations.list({
  userId: tenantId,
  fromTimestamp: startDate,
  toTimestamp: endDate,
});

// Calculate total cost
const totalCost = tenantCosts.reduce((sum, obs) => {
  return sum + (obs.calculatedTotalCost || 0);
}, 0);
```

---

## Summary

**Langfuse Integration:**
- ✅ Automatic tracing of all LLM calls
- ✅ Cost tracking per tenant/model
- ✅ Performance monitoring
- ✅ Debugging capabilities
- ✅ Analytics and insights
- ✅ Self-hostable option
- ✅ Native Vercel AI SDK support

**Key Benefits:**
- Full observability into LLM usage
- Cost optimization insights
- Faster debugging
- Model comparison capabilities
- Compliance and audit trail
