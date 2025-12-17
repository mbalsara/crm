# Email Analysis Framework Design

## Overview

This document defines the flexible analysis framework that supports configurable prompts, models with fallback, versioning, and independent sub-workflows.

---

## 1. Analysis Execution Strategy

### 1.1 Decision: Independent Sub-Workflows (Async)

**Architecture: Event-Driven, Independent Analyses**

```
Email Inserted
    │
    ▼
┌─────────────────┐
│  Inngest Event  │
│  email/inserted │
└────────┬────────┘
         │
         ├─► Always: Domain Extraction (sync)
         ├─► Always: Contact Extraction (sync)
         ├─► Conditional: Signature Extraction (async if needed)
         ├─► Conditional: Sentiment Analysis (async if enabled)
         ├─► Conditional: Escalation Detection (async if enabled)
         ├─► Conditional: Upsell Detection (async if enabled)
         ├─► Conditional: Churn Detection (async if enabled)
         ├─► Conditional: Kudos Detection (async if enabled)
         └─► Conditional: Competitor Detection (async if enabled)
```

**Benefits of Independent Sub-Workflows:**
- **Non-blocking**: One analysis failure doesn't block others
- **Parallel Execution**: Multiple analyses run concurrently
- **Independent Scaling**: Scale each analysis type independently
- **Cost Optimization**: Skip expensive analyses if simple ones fail
- **Flexibility**: Easy to add/remove analysis types

---

## 2. Analysis Framework Schema

### 2.1 Analysis Configuration Schema

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
            "requireLLMIfRegexFieldsMissing": 2,  // Use LLM if regex finds < 2 fields
            "alwaysUseLLM": false
        },
        "sentiment": {
            "requireThreadContext": false  // Can analyze without context
        },
        "signals": {
            "requireThreadContext": true,  // Always need context
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
```

### 2.2 Analysis Definition TypeScript Types

```typescript
// packages/shared/src/types/analysis.ts

export type AnalysisType = 
  | 'domain-extraction'      // Always run
  | 'contact-extraction'     // Always run
  | 'signature-parsing'      // Conditional (if signature present + regex insufficient)
  | 'sentiment'              // Conditional (if enabled)
  | 'escalation'             // Conditional (if enabled)
  | 'upsell'                  // Conditional (if enabled)
  | 'churn'                   // Conditional (if enabled)
  | 'kudos'                   // Conditional (if enabled)
  | 'competitor';             // Conditional (if enabled)

export interface ModelConfig {
  primary: string;    // e.g., 'claude-haiku-3.5'
  fallback?: string;  // e.g., 'gpt-4o-mini' (optional)
}

export interface AnalysisDefinition {
  type: AnalysisType;
  name: string;
  
  // Prompt configuration
  prompt: {
    system: string;
    user: (email: Email, context?: any) => string;
    version: string;  // e.g., 'v1.0' (for Langfuse)
  };
  
  // Model configuration with fallback
  models: ModelConfig;
  
  // Output schema (Zod schema for validation)
  outputSchema: z.ZodSchema<any>;
  
  // Execution settings
  settings: {
    requiresThreadContext: boolean;
    timeout?: number;  // milliseconds
    maxRetries?: number;
    priority?: number;  // Higher = runs first
  };
  
  // Dependencies (which analyses must complete first)
  dependencies?: AnalysisType[];
}

export interface AnalysisConfig {
  tenantId: string;
  enabledAnalyses: Record<AnalysisType, boolean>;
  modelConfigs: Record<AnalysisType, ModelConfig>;
  promptVersions: Record<AnalysisType, string>;
  customPrompts?: Record<AnalysisType, string>;
  analysisSettings: Record<AnalysisType, any>;
}
```

---

## 3. Signature Extraction Decision Logic

### 3.1 When to Use LLM for Signature Parsing

**Strategy: Multi-Stage Decision**

```typescript
class SignatureExtractionService {
  /**
   * Determine if LLM is needed for signature extraction
   */
  async shouldUseLLM(email: Email, config: AnalysisConfig): Promise<boolean> {
    // Step 1: Check if signature is likely present
    const hasSignature = this.detectSignaturePresence(email.body);
    if (!hasSignature) {
      return false; // No signature, skip LLM
    }

    // Step 2: Try regex extraction
    const regexResult = this.extractSignatureRegex(email.body);

    // Step 3: Check if regex is sufficient
    const regexFieldsFound = this.countFields(regexResult);
    const requiredFields = config.analysisSettings?.signature?.requireLLMIfRegexFieldsMissing ?? 2;

    // Decision: Use LLM if regex found < required fields
    if (regexFieldsFound < requiredFields) {
      return true; // Regex insufficient, use LLM
    }

    // Step 4: Optional LLM validation (lightweight check)
    if (config.analysisSettings?.signature?.validateWithLLM) {
      const isValid = await this.validateRegexResult(email.body, regexResult, config);
      return !isValid; // Use LLM if validation fails
    }

    return false; // Regex is sufficient
  }

  /**
   * Detect if email likely has a signature
   */
  private detectSignaturePresence(body: string): boolean {
    if (!body) return false;

    // Common signature indicators
    const signatureIndicators = [
      /(?:best|regards|sincerely|thanks|thank you)[\s,]*$/i,  // Closing phrases
      /(?:phone|tel|mobile|cell)[\s:]*[\d\s\-\(\)\+]+/i,      // Phone numbers
      /(?:title|position|role)[\s:]*[^\n]+/i,                 // Job titles
      /(?:company|organization)[\s:]*[^\n]+/i,                // Company names
      /^--[\s\S]*$/,                                          // Signature separator
      /^__[\s\S]*$/,                                          // Signature separator
    ];

    // Check last 500 characters (signatures usually at end)
    const lastPart = body.substring(Math.max(0, body.length - 500));
    
    return signatureIndicators.some(pattern => pattern.test(lastPart));
  }

  /**
   * Count fields found in regex extraction
   */
  private countFields(result: SignatureData | null): number {
    if (!result) return 0;
    
    let count = 0;
    if (result.name) count++;
    if (result.title) count++;
    if (result.company) count++;
    if (result.phone) count++;
    if (result.email) count++;
    if (result.address) count++;
    
    return count;
  }

  /**
   * Lightweight LLM validation of regex result
   */
  private async validateRegexResult(
    body: string,
    regexResult: SignatureData,
    config: AnalysisConfig
  ): Promise<boolean> {
    // Use cheap model for quick validation
    const response = await this.llm.complete({
      provider: getProviderFromModel(config.modelConfigs.signature.primary),
      model: config.modelConfigs.signature.primary,
      messages: [
        {
          role: 'system',
          content: 'Validate if this signature extraction is complete. Return JSON: { "isComplete": boolean }',
        },
        {
          role: 'user',
          content: `
            Email body (last 500 chars):
            ${body.substring(Math.max(0, body.length - 500))}
            
            Extracted signature:
            ${JSON.stringify(regexResult)}
            
            Is this extraction complete and accurate?
          `,
        },
      ],
      temperature: 0,
      maxTokens: 50,
      responseFormat: 'json',
    });

    const validation = JSON.parse(response.content);
    return validation.isComplete === true;
  }
}
```

### 3.2 Signature Extraction Flow

```
Email Received
    │
    ▼
Has Signature? (detectSignaturePresence)
    ├─ No → Skip signature extraction
    │
    └─ Yes → Try Regex Extraction
         │
         ├─ Fields Found >= Required? → Use Regex Result
         │
         └─ Fields Found < Required? → Use LLM Extraction
              │
              └─ Optional: Validate Regex Result with LLM
                   ├─ Valid → Use Regex Result
                   └─ Invalid → Use LLM Extraction
```

---

## 4. Analysis Framework Implementation

### 4.1 Analysis Registry

```typescript
// apps/analysis/src/framework/registry.ts

import { z } from 'zod';
import type { AnalysisDefinition, AnalysisType } from '@crm/shared';

export class AnalysisRegistry {
  private analyses: Map<AnalysisType, AnalysisDefinition> = new Map();

  /**
   * Register an analysis definition
   */
  register(definition: AnalysisDefinition): void {
    this.analyses.set(definition.type, definition);
  }

  /**
   * Get analysis definition
   */
  get(type: AnalysisType): AnalysisDefinition | undefined {
    return this.analyses.get(type);
  }

  /**
   * Get all enabled analyses for tenant
   */
  getEnabledAnalyses(config: AnalysisConfig): AnalysisDefinition[] {
    const enabled: AnalysisDefinition[] = [];

    // Always include domain and contact extraction
    const alwaysRun: AnalysisType[] = ['domain-extraction', 'contact-extraction'];
    alwaysRun.forEach(type => {
      const def = this.get(type);
      if (def) enabled.push(def);
    });

    // Add enabled analyses
    Object.entries(config.enabledAnalyses).forEach(([type, enabled]) => {
      if (enabled && type !== 'domain-extraction' && type !== 'contact-extraction') {
        const def = this.get(type as AnalysisType);
        if (def) enabled.push(def);
      }
    });

    // Sort by priority (higher first)
    return enabled.sort((a, b) => (b.settings.priority ?? 0) - (a.settings.priority ?? 0));
  }
}
```

### 4.2 Analysis Executor

```typescript
// apps/analysis/src/framework/executor.ts

@injectable()
export class AnalysisExecutor {
  constructor(
    private llm: LLMService,
    private registry: AnalysisRegistry
  ) {}

  /**
   * Execute analysis with fallback support
   */
  async execute(
    definition: AnalysisDefinition,
    email: Email,
    threadContext: string | null,
    config: AnalysisConfig,
    traceContext: { traceId: string; userId: string }
  ): Promise<any> {
    // Check dependencies
    if (definition.settings.dependencies) {
      // Wait for dependencies (handled by Inngest step dependencies)
    }

    // Check if thread context is required
    if (definition.settings.requiresThreadContext && !threadContext) {
      throw new Error(`Analysis ${definition.type} requires thread context`);
    }

    // Build prompt
    const messages = [
      {
        role: 'system' as const,
        content: config.customPrompts?.[definition.type] || definition.prompt.system,
      },
      {
        role: 'user' as const,
        content: definition.prompt.user(email, { threadContext }),
      },
    ];

    // Try primary model, fallback to secondary if needed
    try {
      return await this.executeWithModel(
        definition,
        messages,
        config.modelConfigs[definition.type].primary,
        traceContext,
        config
      );
    } catch (error) {
      // Fallback to secondary model if available
      if (config.modelConfigs[definition.type].fallback) {
        console.warn(`Primary model failed for ${definition.type}, using fallback`);
        return await this.executeWithModel(
          definition,
          messages,
          config.modelConfigs[definition.type].fallback!,
          traceContext,
          config
        );
      }
      throw error;
    }
  }

  private async executeWithModel(
    definition: AnalysisDefinition,
    messages: LLMMessage[],
    model: string,
    traceContext: { traceId: string; userId: string },
    config: AnalysisConfig
  ): Promise<any> {
    const response = await this.llm.complete({
      provider: getProviderFromModel(model),
      model,
      messages,
      temperature: 0,
      maxTokens: definition.settings.maxTokens || 1000,
      responseFormat: 'json',
      traceId: traceContext.traceId,
      userId: traceContext.userId,
      metadata: {
        analysisType: definition.type,
        promptVersion: config.promptVersions[definition.type] || definition.prompt.version,
        model,
      },
    });

    // Validate output against schema
    const parsed = JSON.parse(response.content);
    const validated = definition.outputSchema.parse(parsed);

    return validated;
  }
}
```

### 4.3 Analysis Definitions

```typescript
// apps/analysis/src/analyses/definitions.ts

import { z } from 'zod';

export const sentimentAnalysis: AnalysisDefinition = {
  type: 'sentiment',
  name: 'Sentiment Analysis',
  prompt: {
    system: 'You are a sentiment analyzer for customer emails.',
    user: (email, context) => `
      Thread Context:
      ${context?.threadContext || 'None'}
      
      Current Email:
      Subject: ${email.subject}
      Body: ${email.body?.substring(0, 2000)}
      
      Analyze sentiment and return JSON.
    `,
    version: 'v1.0',
  },
  models: {
    primary: 'claude-haiku-3.5',
    fallback: 'gpt-4o-mini',
  },
  outputSchema: z.object({
    sentiment: z.enum(['positive', 'negative', 'neutral']),
    score: z.number().min(-1).max(1),
  }),
  settings: {
    requiresThreadContext: false,
    timeout: 5000,
    maxRetries: 2,
    priority: 5,
  },
};

export const escalationAnalysis: AnalysisDefinition = {
  type: 'escalation',
  name: 'Escalation Detection',
  prompt: {
    system: 'Detect customer escalation signals in emails.',
    user: (email, context) => `
      Thread Context:
      ${context?.threadContext || 'None'}
      
      Current Email:
      Subject: ${email.subject}
      Body: ${email.body?.substring(0, 3000)}
      
      Detect escalation signals.
    `,
    version: 'v1.0',
  },
  models: {
    primary: 'gpt-4o',
    fallback: 'claude-sonnet-4',
  },
  outputSchema: z.object({
    detected: z.boolean(),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  }),
  settings: {
    requiresThreadContext: true,
    timeout: 10000,
    maxRetries: 2,
    priority: 10, // High priority
  },
  dependencies: ['sentiment'], // Wait for sentiment first
};

// ... more analysis definitions
```

---

## 5. Independent Sub-Workflow Architecture

### 5.1 Inngest Function Structure

```typescript
// apps/api/src/emails/functions.ts

import { inngest } from '../inngest/client';

/**
 * Main email analysis orchestrator
 */
export const analyzeEmail = inngest.createFunction(
  { id: 'analyze-email' },
  { event: 'email/inserted' },
  async ({ event, step }) => {
    const { emailId, tenantId, threadId } = event.data;
    const traceId = `email-analysis-${emailId}-${Date.now()}`;

    // Step 1: Always run - Domain extraction
    await step.run('domain-extraction', async () => {
      await inngest.send({
        name: 'analysis/domain.extract',
        data: { emailId, tenantId, traceId },
      });
    });

    // Step 2: Always run - Contact extraction
    await step.run('contact-extraction', async () => {
      await inngest.send({
        name: 'analysis/contact.extract',
        data: { emailId, tenantId, traceId },
      });
    });

    // Step 3: Conditional - Signature parsing (if needed)
    await step.run('signature-check', async () => {
      // Check if signature extraction is needed
      const needsSignature = await checkSignatureNeeded(emailId, tenantId);
      if (needsSignature) {
        await inngest.send({
          name: 'analysis/signature.parse',
          data: { emailId, tenantId, traceId },
        });
      }
    });

    // Step 4-N: Conditional analyses (independent, parallel)
    const config = await getAnalysisConfig(tenantId);
    
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
```

### 5.2 Analysis Execution Flow

```
Email Inserted Event
    │
    ▼
Main Orchestrator Function
    │
    ├─► Domain Extraction (sync, always)
    │   └─► Update: customers table
    │
    ├─► Contact Extraction (sync, always)
    │   └─► Update: contacts table
    │
    ├─► Signature Check (conditional)
    │   └─► If needed → Signature Parsing (async)
    │       └─► Update: contacts.signature_data
    │
    └─► Send Events for Enabled Analyses (parallel, independent)
        │
        ├─► Sentiment Analysis (async if enabled)
        │   └─► Update: email_analysis.sentiment
        │
        ├─► Escalation Detection (async if enabled)
        │   └─► Update: email_analysis.signals.escalation
        │   └─► If detected → Create Task (async)
        │
        ├─► Upsell Detection (async if enabled)
        │   └─► Update: email_analysis.signals.upsell
        │
        ├─► Churn Detection (async if enabled)
        │   └─► Update: email_analysis.signals.churn
        │
        ├─► Kudos Detection (async if enabled)
        │   └─► Update: email_analysis.signals.kudos
        │
        └─► Competitor Detection (async if enabled)
            └─► Update: email_analysis.signals.competitor
```

---

## 6. Additional Framework Considerations

### 6.1 Missing Elements (Added)

1. **Retry Configuration**: Per-analysis retry settings
2. **Timeout Settings**: Per-analysis timeout limits
3. **Priority/Ordering**: Control execution order
4. **Dependencies**: Some analyses depend on others
5. **Cost Limits**: Per-analysis cost budgets
6. **Rate Limiting**: Per-analysis rate limits
7. **Output Validation**: Zod schemas for structured output
8. **Prompt Versioning**: Track prompt versions for A/B testing
9. **Model Fallback**: Automatic fallback to secondary model
10. **Error Handling**: Graceful degradation per analysis

### 6.2 Complete Analysis Definition

```typescript
export interface AnalysisDefinition {
  type: AnalysisType;
  name: string;
  
  // Prompt configuration
  prompt: {
    system: string;
    user: (email: Email, context?: any) => string;
    version: string;  // ✅ Added: For Langfuse observability
  };
  
  // Model configuration with fallback
  models: {
    primary: string;
    fallback?: string;  // ✅ Added: Fallback model
  };
  
  // Output schema (Zod schema for validation)
  outputSchema: z.ZodSchema<any>;  // ✅ Added: Structured JSON validation
  
  // Execution settings
  settings: {
    requiresThreadContext: boolean;
    timeout?: number;  // ✅ Added: Per-analysis timeout
    maxRetries?: number;  // ✅ Added: Retry configuration
    priority?: number;  // ✅ Added: Execution priority
    maxCost?: number;  // ✅ Added: Cost limit per analysis
    rateLimit?: { limit: number; period: string };  // ✅ Added: Rate limiting
  };
  
  // Dependencies (which analyses must complete first)
  dependencies?: AnalysisType[];  // ✅ Added: Analysis dependencies
}
```

---

## 7. Implementation Summary

### 7.1 Always-Run Analyses

1. **Domain Extraction**: Always executed synchronously
2. **Contact Extraction**: Always executed synchronously

### 7.2 Conditional Analyses

1. **Signature Parsing**: 
   - Run if: Signature detected AND regex insufficient
   - Decision: Regex fields < threshold OR LLM validation fails

2. **Other Analyses** (Sentiment, Escalation, Upsell, Churn, Kudos, Competitor):
   - Run if: Enabled in tenant config
   - Execution: Independent, async, parallel

### 7.3 Framework Features

✅ **Prompt Management**: System/user prompts with versioning  
✅ **Model Selection**: Primary + fallback models  
✅ **Output Validation**: Zod schemas for structured JSON  
✅ **Version Tracking**: Prompt versions for Langfuse  
✅ **Independent Execution**: Each analysis runs as separate Inngest function  
✅ **Parallel Processing**: Multiple analyses run concurrently  
✅ **Error Isolation**: One analysis failure doesn't affect others  
✅ **Cost Control**: Per-analysis cost limits  
✅ **Retry Logic**: Configurable retries per analysis  
✅ **Dependencies**: Some analyses can depend on others  

---

## 8. Example: Complete Analysis Flow

```typescript
// Email inserted → Main orchestrator
export const analyzeEmail = inngest.createFunction(
  { id: 'analyze-email' },
  { event: 'email/inserted' },
  async ({ event, step }) => {
    const { emailId, tenantId, threadId } = event.data;
    const traceId = `email-analysis-${emailId}`;

    // Always-run analyses (synchronous, blocking)
    await step.run('domain-extraction', async () => {
      // Extract domains, create customers
      await domainService.extractAndCreate(emailId, tenantId);
    });

    await step.run('contact-extraction', async () => {
      // Extract contacts, link to customers
      await contactService.extractAndCreate(emailId, tenantId);
    });

    // Conditional: Signature parsing
    const needsSignature = await step.run('check-signature', async () => {
      return await signatureService.shouldUseLLM(emailId, tenantId);
    });

    if (needsSignature) {
      await step.sendEvent('parse-signature', {
        name: 'analysis/signature.parse',
        data: { emailId, tenantId, traceId },
      });
    }

    // Conditional: Enabled analyses (independent, parallel)
    const config = await getAnalysisConfig(tenantId);
    const enabledAnalyses = Object.entries(config.enabledAnalyses)
      .filter(([_, enabled]) => enabled)
      .map(([type]) => ({
        name: `analysis/${type}` as const,
        data: { emailId, tenantId, threadId, traceId },
      }));

    if (enabledAnalyses.length > 0) {
      await step.sendEvent('trigger-analyses', enabledAnalyses);
    }

    return { emailId, traceId };
  }
);
```

---

## 9. Benefits of Independent Sub-Workflows

1. **Resilience**: One analysis failure doesn't block others
2. **Performance**: Parallel execution of independent analyses
3. **Scalability**: Scale each analysis type independently
4. **Cost Optimization**: Skip expensive analyses if prerequisites fail
5. **Flexibility**: Easy to add/remove analysis types
6. **Observability**: Each analysis visible separately in Inngest/Langfuse
7. **Debugging**: Isolate issues to specific analysis types

---

## 10. Next Steps

1. Implement analysis registry system
2. Create analysis definitions for each type
3. Implement signature detection logic
4. Create individual Inngest functions for each analysis
5. Set up Langfuse prompt versioning
6. Implement model fallback logic
7. Add output schema validation
