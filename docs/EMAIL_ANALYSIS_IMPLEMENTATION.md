# Email Analysis Implementation Design

This document addresses the implementation details for the email analysis system, including LLM abstraction, service architecture, analysis configuration, and thread context handling.

**Key Design Principle**: **Caller-configurable model selection** - The tenant/caller decides which model and version to use via `analysis_configs` table. The system uses Vercel AI SDK to support any model from supported providers.

---

## 1. LLM Provider Abstraction

### 1.1 Recommendation: Use Vercel AI SDK with Caller-Configurable Models

**Why Vercel AI SDK:**

1. **Provider-Agnostic**: Supports OpenAI, Anthropic, Google, Mistral, Cohere, etc.
2. **Lightweight**: ~50KB (vs LangChain's ~5MB)
3. **Type-Safe**: Excellent TypeScript support with type inference
4. **Well-Maintained**: Actively developed by Vercel, regular updates
5. **Built-in Features**: Streaming, retries, error handling, token counting
6. **Works Anywhere**: Not tied to Vercel platform, works in Node.js/Edge
7. **Free & Open Source**: MIT license, no vendor lock-in

**Comparison:**

| Feature | Custom | Vercel AI SDK | LangChain |
|--------|--------|---------------|-----------|
| Size | ~10KB | ~50KB | ~5MB |
| Provider Support | Manual | 10+ providers | 100+ providers |
| Type Safety | Manual | Excellent | Good |
| Streaming | Manual | Built-in | Built-in |
| Maintenance | You | Vercel | Community |

**Recommendation: Vercel AI SDK**

Best balance of features, size, and maintainability. Saves development time while providing excellent type safety and built-in features like streaming (useful for future auto-response features).

### 1.2 Vercel AI SDK Implementation

**Installation:**
```bash
pnpm add ai @ai-sdk/openai @ai-sdk/anthropic langfuse
```

**Implementation:**

```typescript
// packages/shared/src/llm/types.ts

export type LLMProvider = 'openai' | 'anthropic';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  provider: LLMProvider;
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface LLMCompletionResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls';
}

// packages/shared/src/llm/client.ts

import { injectable } from 'tsyringe';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, streamText } from 'ai';
import { Langfuse } from 'langfuse';
import type { LLMProvider, LLMCompletionOptions, LLMCompletionResponse } from './types';

@injectable()
export class LLMService {
  private langfuse: Langfuse | null = null;

  constructor() {
    // Initialize Langfuse if configured
    if (process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY) {
      this.langfuse = new Langfuse({
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
      });
    }
  }
  /**
   * Get Vercel AI SDK model instance from provider and model name
   * Supports any model supported by Vercel AI SDK
   */
  private getModel(provider: LLMProvider, model: string) {
    switch (provider) {
      case 'openai':
        return openai(model); // Supports: gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, etc.
      case 'anthropic':
        return anthropic(model); // Supports: claude-haiku-3.5, claude-sonnet-4, claude-opus-4, etc.
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Complete text generation
   * Model and version are specified by caller via config
   * Automatically traces to Langfuse for observability
   */
  async complete(
    options: LLMCompletionOptions & {
      traceId?: string;
      userId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<LLMCompletionResponse> {
    const model = this.getModel(options.provider, options.model);

    // Create Langfuse trace if configured
    const trace = this.langfuse?.trace({
      id: options.traceId,
      userId: options.userId,
      metadata: {
        provider: options.provider,
        model: options.model,
        ...options.metadata,
      },
    });

    const generation = trace?.generation({
      name: 'llm-completion',
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

      // Log to Langfuse
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
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
        },
        finishReason: result.finishReason as 'stop' | 'length' | 'content_filter' | 'tool_calls',
      };
    } catch (error: any) {
      // Log error to Langfuse
      generation?.end({
        level: 'ERROR',
        statusMessage: error.message,
        metadata: { error: error.toString() },
      });
      throw error;
    }
  }

  /**
   * Stream text generation (useful for future auto-response features)
   * Model and version are specified by caller via config
   */
  async *stream(options: LLMCompletionOptions): AsyncIterable<string> {
    const model = this.getModel(options.provider, options.model);

    const result = await streamText({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0,
      maxTokens: options.maxTokens,
      ...(options.responseFormat === 'json' && {
        responseFormat: { type: 'json_object' },
      }),
    });

    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }
}
```

### 1.3 Usage Example

```typescript
// In analysis service
import { LLMService } from '@crm/shared';

class EmailAnalysisService {
  constructor(private llm: LLMService) {}

  async analyzeSentiment(
    email: Email,
    threadEmails: Email[],
    config: AnalysisConfig,
    traceContext?: { traceId: string; userId: string }
  ) {
    const response = await this.llm.complete({
      provider: getProviderFromModel(config.models.sentiment), // Auto-detect from model name
      model: config.models.sentiment, // Caller-specified model (e.g., 'claude-haiku-3.5', 'gpt-4o-mini')
      messages: [
        { role: 'system', content: 'You are a sentiment analyzer...' },
        { role: 'user', content: `Analyze: ${email.body}` },
      ],
      temperature: 0,
      maxTokens: 100,
      responseFormat: 'json',
      traceId: traceContext?.traceId,
      userId: traceContext?.userId,
      metadata: {
        analysisType: 'sentiment',
        emailId: email.id,
        tenantId: config.tenantId,
      },
    });

    return JSON.parse(response.content);
  }
}
```

### 1.4 Benefits of Vercel AI SDK

1. **Type Safety**: Full TypeScript support with type inference
2. **Streaming**: Built-in streaming support (ready for auto-responses)
3. **Retries**: Automatic retry logic with exponential backoff
4. **Error Handling**: Consistent error handling across providers
5. **Token Counting**: Built-in token counting utilities
6. **Provider Switching**: Change provider with one line of code
7. **Future-Proof**: Easy to add new providers (Google, Mistral, etc.)
8. **Model Flexibility**: Caller can specify any model/version (e.g., `gpt-4o`, `gpt-4o-mini`, `claude-haiku-3.5`, `claude-sonnet-4`)
9. **Langfuse Integration**: Built-in support for Langfuse observability

### 1.5 Model Selection Strategy

**Caller-Configurable Models:**
- Models are specified per tenant in `analysis_configs` table
- Each analysis type (sentiment, signals, signature) can use different models
- System auto-detects provider from model name (e.g., `gpt-*` → OpenAI, `claude-*` → Anthropic)
- Default models provided, but tenants can override based on:
  - Cost requirements
  - Quality requirements
  - Latency requirements
  - Specific use cases

**Example Configurations:**

```typescript
// Cost-optimized tenant
{
  sentiment_model: 'gpt-4o-mini',      // Cheapest
  signals_model: 'gpt-4o-mini',       // Cheapest
  signature_model: 'gpt-4o-mini',     // Cheapest
}

// Quality-optimized tenant
{
  sentiment_model: 'claude-haiku-3.5', // Fast + accurate
  signals_model: 'gpt-4o',             // Best quality
  signature_model: 'claude-haiku-3.5',  // Fast + accurate
}

// Balanced tenant (defaults)
{
  sentiment_model: 'claude-haiku-3.5', // Fast + cheap
  signals_model: 'gpt-4o',             // Quality for complex signals
  signature_model: 'claude-haiku-3.5', // Fast + cheap
}
```

---

## 1.6 Langfuse Observability Integration

**Why Langfuse:**
- Open-source LLM observability platform
- Automatic tracing of all LLM calls
- Cost tracking per tenant/model
- Performance monitoring (latency, tokens, errors)
- Debugging capabilities (see exact prompts/responses)
- Native integration with Vercel AI SDK

**Integration:**

```typescript
// LLM Service automatically traces to Langfuse
const response = await this.llm.complete({
  provider: 'anthropic',
  model: 'claude-haiku-3.5',
  messages: [...],
  traceId: 'email-analysis-123', // Links all LLM calls in trace
  userId: tenantId, // For per-tenant analytics
  metadata: {
    analysisType: 'sentiment',
    emailId: '...',
  },
});
```

**Benefits:**
- See every LLM call with full context
- Track costs per tenant/model
- Debug issues quickly
- Compare model performance
- Set up alerts for errors/costs

See `LANGFUSE_OBSERVABILITY.md` for detailed integration guide.

---

## 2. Analysis Execution Strategy

### 2.1 Decision: Independent Sub-Workflows (Async)

**Architecture: Event-Driven, Independent Analyses**

- **Always Run**: Domain extraction, Contact extraction (synchronous)
- **Conditional**: Signature parsing (if signature present + regex insufficient)
- **Conditional**: Other analyses (if enabled in tenant config)
- **Execution**: Each analysis runs as independent Inngest function
- **Updates**: Each analysis updates API independently (non-blocking)

**Benefits:**
- One analysis failure doesn't block others
- Parallel execution of independent analyses
- Independent scaling per analysis type
- Easy to add/remove analysis types

See `ANALYSIS_FRAMEWORK_DESIGN.md` for complete framework design.

---

## 2. Service Architecture

### 2.1 Recommended Architecture

**Option A: Separate Analysis Service (Recommended)**
```
┌─────────────┐
│  API Service│
│  (Hono)     │
└──────┬──────┘
       │
       │ 1. Email inserted
       │ 2. Send event to Inngest
       ▼
┌─────────────┐
│   Inngest   │
│  Functions  │
└──────┬──────┘
       │
       │ 3. Call analysis service
       ▼
┌─────────────────┐
│ Analysis Service│
│  (Hono)         │
│  - LLM calls    │
│  - Analysis     │
└──────┬──────────┘
       │
       │ 4. Save results via API
       ▼
┌─────────────┐
│  API Service│
│  (REST API) │
└─────────────┘
```

**Option B: Monolithic (Not Recommended)**
- All logic in API service
- Harder to scale analysis independently
- LLM calls block API requests

**Recommendation: Separate Analysis Service**

### 2.2 Why Separate Service?

1. **Independent Scaling**: Scale analysis workers separately from API
2. **Resource Isolation**: LLM calls are CPU/memory intensive
3. **Cost Optimization**: Can use cheaper compute for analysis
4. **Failure Isolation**: Analysis failures don't affect API
5. **Deployment Flexibility**: Deploy analysis service to different regions

### 2.3 Implementation

**Analysis Service Structure:**
```
apps/analysis/
├── src/
│   ├── index.ts              # Hono server
│   ├── routes/
│   │   └── analyze.ts        # Analysis endpoints
│   ├── services/
│   │   ├── domain-extraction.ts
│   │   ├── company-identification.ts
│   │   ├── contact-extraction.ts
│   │   ├── signature-parsing.ts
│   │   └── email-analysis.ts
│   ├── llm/
│   │   └── prompts.ts        # Prompt templates
│   └── di/
│       └── container.ts
├── package.json
└── Dockerfile
```

**Inngest Function (in API service):**
```typescript
// apps/api/src/emails/functions.ts
import { inngest } from '../inngest/client';
import { AnalysisClient } from '@crm/clients';

export const analyzeEmail = inngest.createFunction(
  { id: 'analyze-email' },
  { event: 'email/inserted' },
  async ({ event, step }) => {
    const { emailId, tenantId, threadId } = event.data;
    const analysisClient = new AnalysisClient();

    // Step 1: Get analysis configuration from API
    const config = await step.run('get-analysis-config', async () => {
      return await analysisClient.getAnalysisConfig(tenantId);
    });

    // Step 2: Call analysis service
    const analysis = await step.run('analyze-email', async () => {
      return await analysisClient.analyzeEmail({
        emailId,
        tenantId,
        threadId,
        config,
      });
    });

    // Step 3: Save results via API
    await step.run('save-analysis', async () => {
      return await analysisClient.saveAnalysis(tenantId, emailId, analysis);
    });

    return analysis;
  }
);
```

**Analysis Service Endpoint:**
```typescript
// apps/analysis/src/routes/analyze.ts
import { Hono } from 'hono';
import { AnalysisService } from '../services/email-analysis';

const app = new Hono();

app.post('/analyze', async (c) => {
  const { emailId, tenantId, threadId, config } = await c.req.json();

  const analysisService = container.resolve(AnalysisService);
  const result = await analysisService.analyze({
    emailId,
    tenantId,
    threadId,
    config,
  });

  return c.json(result);
});

export default app;
```

**Analysis Client (in packages/clients):**
```typescript
// packages/clients/src/analysis/client.ts
import { BaseClient } from '../base-client';

export class AnalysisClient extends BaseClient {
  async getAnalysisConfig(tenantId: string): Promise<AnalysisConfig> {
    return this.get<AnalysisConfig>(`/api/tenants/${tenantId}/analysis-config`);
  }

  async analyzeEmail(params: {
    emailId: string;
    tenantId: string;
    threadId: string;
    config: AnalysisConfig;
  }): Promise<EmailAnalysis> {
    return this.post<EmailAnalysis>('/analyze', params);
  }

  async saveAnalysis(
    tenantId: string,
    emailId: string,
    analysis: EmailAnalysis
  ): Promise<void> {
    return this.post(`/api/emails/${emailId}/analysis`, {
      tenantId,
      analysis,
    });
  }
}
```

---

## 3. Analysis Configuration

### 3.1 Configuration Model

**Database Schema:**
```sql
CREATE TABLE analysis_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Analysis types to run
    enabled_analyses JSONB NOT NULL DEFAULT '{
        "sentiment": true,
        "escalation": true,
        "upsell": true,
        "churn": true,
        "kudos": true,
        "competitor": true
    }',
    
    -- Model configuration (caller-configurable per tenant)
    -- Supports any model from Vercel AI SDK (OpenAI, Anthropic, etc.)
    sentiment_model VARCHAR(100) NOT NULL DEFAULT 'claude-haiku-3.5', -- e.g., 'claude-haiku-3.5', 'gpt-4o-mini'
    signals_model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o', -- e.g., 'gpt-4o', 'claude-sonnet-4', 'gpt-4o-mini'
    signature_model VARCHAR(100) NOT NULL DEFAULT 'claude-haiku-3.5', -- e.g., 'claude-haiku-3.5', 'gpt-4o-mini'
    
    -- Thresholds
    escalation_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.7,
    churn_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.7,
    
    -- Prompt customization (optional)
    custom_prompts JSONB,
    
    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uniq_analysis_config_tenant UNIQUE (tenant_id)
);
```

**TypeScript Types:**
```typescript
// packages/shared/src/types/analysis.ts

export interface AnalysisConfig {
  tenantId: string;
  enabledAnalyses: {
    sentiment: boolean;
    escalation: boolean;
    upsell: boolean;
    churn: boolean;
    kudos: boolean;
    competitor: boolean;
  };
  models: {
    sentiment: string;      // Caller-configurable: e.g., 'claude-haiku-3.5', 'gpt-4o-mini', 'gpt-4o'
    signals: string;        // Caller-configurable: e.g., 'gpt-4o', 'claude-sonnet-4', 'gpt-4o-mini'
    signature: string;      // Caller-configurable: e.g., 'claude-haiku-3.5', 'gpt-4o-mini'
  };
  thresholds: {
    escalation: number;     // 0.0-1.0
    churn: number;
    upsell: number;
  };
  customPrompts?: {
    sentiment?: string;
    escalation?: string;
    // ... etc
  };
}

/**
 * Helper to determine provider from model name
 * Used by Vercel AI SDK to route to correct provider
 */
export function getProviderFromModel(model: string): 'openai' | 'anthropic' {
  if (model.startsWith('gpt-') || model.startsWith('o1-')) {
    return 'openai';
  }
  if (model.startsWith('claude-')) {
    return 'anthropic';
  }
  // Default to OpenAI for unknown models
  return 'openai';
}
```

### 3.2 Prompt Management

**Prompt Service:**
```typescript
// apps/analysis/src/services/prompts.ts

export class PromptService {
  getSentimentPrompt(email: Email, threadContext: string, customPrompt?: string): LLMMessage[] {
    const systemPrompt = customPrompt || `
      You are a sentiment analyzer for customer emails.
      Analyze the sentiment of the email in context of the thread.
      Return JSON: { "sentiment": "positive"|"negative"|"neutral", "score": -1.0 to 1.0 }
    `;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `
        Thread Context:
        ${threadContext}

        Current Email:
        Subject: ${email.subject}
        Body: ${email.body?.substring(0, 2000)}
      ` },
    ];
  }

  getSignalsPrompt(email: Email, threadContext: string, config: AnalysisConfig): LLMMessage[] {
    const enabledSignals = Object.entries(config.enabledAnalyses)
      .filter(([_, enabled]) => enabled)
      .map(([signal, _]) => signal)
      .join(', ');

    const systemPrompt = config.customPrompts?.signals || `
      Analyze this email for business signals: ${enabledSignals}
      Return JSON with detected signals and confidence scores.
    `;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `
        Thread Context:
        ${threadContext}

        Current Email:
        Subject: ${email.subject}
        Body: ${email.body?.substring(0, 3000)}
      ` },
    ];
  }
}
```

**Analysis Service:**
```typescript
// apps/analysis/src/services/email-analysis.ts

@injectable()
export class EmailAnalysisService {
  constructor(
    private llm: LLMService,
    private promptService: PromptService,
    private emailClient: EmailClient  // To fetch email/thread from API
  ) {}

  async analyze(params: {
    emailId: string;
    tenantId: string;
    threadId: string;
    config: AnalysisConfig;
  }): Promise<EmailAnalysis> {
    const { emailId, tenantId, threadId, config } = params;

    // Create Langfuse trace for entire analysis pipeline
    const traceId = `email-analysis-${emailId}-${Date.now()}`;
    const traceContext = {
      traceId,
      userId: tenantId,
    };

    // 1. Fetch email and thread from API
    const email = await this.emailClient.getEmail(tenantId, emailId);
    const threadEmails = await this.emailClient.getThreadEmails(tenantId, threadId);

    // 2. Build thread context
    const threadContext = this.buildThreadContext(threadEmails);

    // 3. Run enabled analyses using models from config (caller-configurable)
    const results: Partial<EmailAnalysis> = {};

    if (config.enabledAnalyses.sentiment) {
      const messages = this.promptService.getSentimentPrompt(
        email,
        threadContext,
        config.customPrompts?.sentiment
      );
      const response = await this.llm.complete({
        provider: getProviderFromModel(config.models.sentiment), // Auto-detect from model name
        model: config.models.sentiment, // Caller-specified model (e.g., 'claude-haiku-3.5', 'gpt-4o-mini')
        messages,
        responseFormat: 'json',
        traceId,
        userId: tenantId,
        metadata: {
          analysisType: 'sentiment',
          emailId,
          threadId,
        },
      });
      results.sentiment = JSON.parse(response.content);
    }

    if (config.enabledAnalyses.escalation || 
        config.enabledAnalyses.upsell || 
        config.enabledAnalyses.churn ||
        config.enabledAnalyses.kudos ||
        config.enabledAnalyses.competitor) {
      const messages = this.promptService.getSignalsPrompt(email, threadContext, config);
      const response = await this.llm.complete({
        provider: getProviderFromModel(config.models.signals), // Auto-detect from model name
        model: config.models.signals, // Caller-specified model (e.g., 'gpt-4o', 'claude-sonnet-4', 'gpt-4o-mini')
        messages,
        responseFormat: 'json',
        traceId,
        userId: tenantId,
        metadata: {
          analysisType: 'signals',
          emailId,
          threadId,
          enabledSignals: Object.entries(config.enabledAnalyses)
            .filter(([_, enabled]) => enabled)
            .map(([signal]) => signal),
        },
      });
      results.signals = JSON.parse(response.content);
    }

    return results as EmailAnalysis;
  }
}
```

---

## 4. Thread Analysis & Context Management

### 4.1 Problem: When to Include Thread Context?

**Challenges:**
1. **Token Limits**: LLM context windows are limited (e.g., 128K tokens)
2. **Cost**: More context = more tokens = higher cost
3. **Relevance**: Not all emails need full thread context
4. **Performance**: Larger contexts = slower responses

### 4.2 Solution: Adaptive Context Selection

**Strategy: Multi-Stage Approach**

1. **Stage 1: Analyze current email alone** (fast, cheap)
2. **Stage 2: If needed, fetch thread context** (LLM decides)
3. **Stage 3: Re-analyze with context** (if needed)

### 4.3 Implementation

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

    // Step 1: Fetch current email
    const email = await this.emailClient.getEmail(tenantId, emailId);

    // Step 2: Quick analysis without context (for simple cases)
    const quickAnalysis = await this.analyzeWithoutContext(email, config);

    // Step 3: Determine if thread context is needed
    const needsContext = await this.shouldIncludeThreadContext(
      email,
      quickAnalysis,
      config
    );

    if (!needsContext) {
      return quickAnalysis;
    }

    // Step 4: Fetch thread and build context
    const threadEmails = await this.emailClient.getThreadEmails(tenantId, threadId);
    const threadContext = this.buildThreadContext(threadEmails, email);

    // Step 5: Re-analyze with context
    return await this.analyzeWithContext(email, threadContext, config);
  }

  /**
   * Quick analysis without thread context
   */
  private async analyzeWithoutContext(
    email: Email,
    config: AnalysisConfig
  ): Promise<EmailAnalysis> {
    const messages = [
      { role: 'system', content: 'Analyze this email for sentiment and business signals.' },
      { role: 'user', content: `Subject: ${email.subject}\nBody: ${email.body?.substring(0, 2000)}` },
    ];

    const response = await this.llm.complete({
      provider: this.getProvider(config.models.signals),
      model: config.models.signals,
      messages,
      responseFormat: 'json',
    });

    return JSON.parse(response.content);
  }

  /**
   * LLM decides if thread context is needed
   */
  private async shouldIncludeThreadContext(
    email: Email,
    quickAnalysis: EmailAnalysis,
    config: AnalysisConfig
  ): Promise<boolean> {
    // Rule 1: If escalation/churn detected, always need context
    if (quickAnalysis.signals?.escalation?.detected || 
        quickAnalysis.signals?.churn?.detected) {
      return true;
    }

    // Rule 2: If email is a reply (subject starts with "Re:"), need context
    if (email.subject.toLowerCase().startsWith('re:')) {
      return true;
    }

    // Rule 3: Ask LLM if context is needed (lightweight check)
    const messages = [
      {
        role: 'system',
        content: 'Determine if this email needs thread context for accurate analysis. Return JSON: { "needsContext": boolean, "reason": string }',
      },
      {
        role: 'user',
        content: `
          Email Subject: ${email.subject}
          Email Preview: ${email.body?.substring(0, 500)}
          Current Analysis: ${JSON.stringify(quickAnalysis)}
          
          Does this email reference previous messages or require thread context?
        `,
      },
    ];

    const response = await this.llm.complete({
      provider: getProviderFromModel(config.models.signature), // Auto-detect provider
      model: config.models.signature, // Use tenant-configured model (default: 'claude-haiku-3.5')
      messages,
      responseFormat: 'json',
      maxTokens: 50,
    });

    const decision = JSON.parse(response.content);
    return decision.needsContext === true;
  }

  /**
   * Build thread context intelligently
   */
  private buildThreadContext(threadEmails: Email[], currentEmail: Email): string {
    // Sort by received_at
    const sorted = [...threadEmails].sort(
      (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()
    );

    // Strategy 1: Last N emails (simple)
    const recentEmails = sorted.slice(-5);

    // Strategy 2: Smart selection (better)
    // - Always include first email (original context)
    // - Include last 3-5 emails (recent context)
    // - Include emails with high sentiment scores (important moments)
    const importantEmails = this.selectImportantEmails(sorted, currentEmail);

    // Build context string
    return importantEmails
      .map((e, idx) => {
        const isCurrent = e.id === currentEmail.id;
        return `
[${isCurrent ? 'CURRENT' : `Message ${idx + 1}`}] ${e.receivedAt.toISOString()}
From: ${e.fromName || e.fromEmail}
Subject: ${e.subject}
${isCurrent ? '' : `Body: ${e.body?.substring(0, 500)}...`}
        `.trim();
      })
      .join('\n\n---\n\n');
  }

  /**
   * Select important emails from thread
   */
  private selectImportantEmails(
    threadEmails: Email[],
    currentEmail: Email
  ): Email[] {
    const selected: Email[] = [];

    // Always include first email
    if (threadEmails.length > 0) {
      selected.push(threadEmails[0]);
    }

    // Always include current email
    selected.push(currentEmail);

    // Include last 3 emails (excluding current)
    const recent = threadEmails
      .filter(e => e.id !== currentEmail.id)
      .slice(-3);
    
    recent.forEach(e => {
      if (!selected.find(s => s.id === e.id)) {
        selected.push(e);
      }
    });

    // Sort by received_at
    return selected.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }

  /**
   * Analyze with thread context
   */
  private async analyzeWithContext(
    email: Email,
    threadContext: string,
    config: AnalysisConfig
  ): Promise<EmailAnalysis> {
    const messages = this.promptService.getSignalsPrompt(
      email,
      threadContext,
      config
    );

    const response = await this.llm.complete({
      provider: this.getProvider(config.models.signals),
      model: config.models.signals,
      messages,
      responseFormat: 'json',
    });

    return JSON.parse(response.content);
  }
}
```

### 4.4 Alternative: Token-Aware Context Building

**More Sophisticated Approach:**

```typescript
/**
 * Build context that fits within token budget
 */
private buildContextWithinBudget(
  threadEmails: Email[],
  currentEmail: Email,
  maxTokens: number = 50000  // Leave room for prompt + response
): string {
  const selected: Email[] = [];
  let estimatedTokens = 0;

  // Always include current email
  selected.push(currentEmail);
  estimatedTokens += this.estimateTokens(currentEmail);

  // Add emails in reverse chronological order until budget exhausted
  const reversed = [...threadEmails]
    .filter(e => e.id !== currentEmail.id)
    .reverse();

  for (const email of reversed) {
    const emailTokens = this.estimateTokens(email);
    if (estimatedTokens + emailTokens > maxTokens) {
      break;
    }
    selected.unshift(email); // Add to beginning
    estimatedTokens += emailTokens;
  }

  // Always try to include first email if possible
  if (threadEmails.length > 0 && 
      !selected.find(e => e.id === threadEmails[0].id)) {
    const firstEmailTokens = this.estimateTokens(threadEmails[0]);
    if (estimatedTokens + firstEmailTokens <= maxTokens) {
      selected.unshift(threadEmails[0]);
    }
  }

  return this.buildContextString(selected);
}

private estimateTokens(email: Email): number {
  // Rough estimate: ~4 characters per token
  const text = `${email.subject} ${email.body || ''}`;
  return Math.ceil(text.length / 4);
}
```

### 4.5 Decision Flow Diagram

```
Start Analysis
    │
    ▼
Analyze Email Alone (Fast)
    │
    ▼
Need Context?
    ├─ No → Return Results
    │
    ├─ Yes (Escalation/Churn) → Fetch Full Thread
    │
    └─ Maybe → Ask LLM (Lightweight)
         │
         ├─ No → Return Results
         │
         └─ Yes → Fetch Thread
              │
              ▼
         Build Smart Context
              │
              ▼
         Re-analyze with Context
              │
              ▼
         Return Results
```

---

## 5. Complete Flow Example

### 5.1 End-to-End Flow

```
1. Email Inserted (API Service)
   ↓
2. Send Inngest Event: email/inserted
   ↓
3. Inngest Function: analyze-email
   │
   ├─ Step 1: Get analysis config from API
   │
   ├─ Step 2: Call analysis service
   │   │
   │   ├─ Fetch email from API
   │   │
   │   ├─ Quick analysis (no context)
   │   │
   │   ├─ Decide: Need context?
   │   │   ├─ No → Return results
   │   │   └─ Yes → Fetch thread → Re-analyze
   │   │
   │   └─ Return analysis
   │
   └─ Step 3: Save results via API
```

### 5.2 Code Example

```typescript
// Complete flow in Inngest function

export const analyzeEmail = inngest.createFunction(
  { id: 'analyze-email' },
  { event: 'email/inserted' },
  async ({ event, step }) => {
    const { emailId, tenantId, threadId } = event.data;
    const analysisClient = new AnalysisClient();
    const emailClient = new EmailClient();

    // Step 1: Get configuration
    const config = await step.run('get-config', async () => {
      return await analysisClient.getAnalysisConfig(tenantId);
    });

    // Step 2: Analyze email
    const analysis = await step.run('analyze', async () => {
      return await analysisClient.analyzeEmail({
        emailId,
        tenantId,
        threadId,
        config,
      });
    });

    // Step 3: Save analysis results
    await step.run('save-results', async () => {
      return await emailClient.saveAnalysis(tenantId, emailId, analysis);
    });

    // Step 4: Create task if escalation
    if (analysis.signals?.escalation?.detected && 
        analysis.signals.escalation.confidence > config.thresholds.escalation) {
      await step.run('create-task', async () => {
        return await emailClient.createTaskFromEmail(tenantId, emailId, analysis);
      });
    }

    // Step 5: Attach labels
    await step.run('attach-labels', async () => {
      return await emailClient.attachLabels(tenantId, emailId, analysis);
    });

    return { emailId, analysis };
  }
);
```

---

## 6. Summary

### 6.1 Key Decisions

1. **LLM Abstraction**: Vercel AI SDK with caller-configurable models
2. **Service Architecture**: Separate analysis service (scalable, isolated)
3. **Configuration**: Database-driven, per-tenant analysis config
4. **Thread Context**: Adaptive selection (analyze first, fetch context if needed)
5. **Observability**: Langfuse for comprehensive LLM tracing and monitoring

### 6.2 Benefits

- **Flexibility**: Easy to switch LLM providers and models
- **Scalability**: Analysis service scales independently
- **Cost**: Only fetch context when needed, configurable models per tenant
- **Performance**: Fast path for simple emails
- **Observability**: Each step visible in Inngest dashboard + Langfuse LLM traces
- **Model Selection**: Tenants can choose models based on cost/quality needs

### 6.3 Next Steps

1. Install Vercel AI SDK and Langfuse
2. Implement LLM service with Langfuse integration
3. Create analysis service structure
4. Implement adaptive context selection
5. Add analysis configuration API
6. Integrate with Inngest functions
7. Set up Langfuse dashboard for monitoring
