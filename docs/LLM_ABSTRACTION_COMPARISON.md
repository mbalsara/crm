# LLM Abstraction Layer Comparison

## Options Considered

1. **Custom Abstraction Layer** (Originally recommended)
2. **Vercel AI SDK** (User suggestion)
3. **LangChain** (Heavyweight option)

---

## Vercel AI SDK Analysis

### Pros

1. **Provider-Agnostic**
   - Supports OpenAI, Anthropic, Google, Mistral, Cohere, etc.
   - Unified API across providers
   - Easy to switch providers

2. **Lightweight**
   - ~50KB (vs LangChain's ~5MB)
   - No unnecessary dependencies
   - Fast installation

3. **Type-Safe**
   - Excellent TypeScript support
   - Type inference for responses
   - Compile-time safety

4. **Well-Maintained**
   - Actively developed by Vercel
   - Regular updates
   - Good documentation
   - Large community

5. **Built-in Features**
   - Streaming support (built-in)
   - Retry logic
   - Error handling
   - Token counting utilities
   - Response parsing helpers

6. **Works Anywhere**
   - Not tied to Vercel platform
   - Works in Node.js, Edge, etc.
   - Can use in any environment

7. **Free & Open Source**
   - MIT license
   - No vendor lock-in
   - Can fork if needed

### Cons

1. **Less Control**
   - Can't customize low-level details easily
   - Some provider-specific features may not be exposed

2. **Vercel Branding**
   - Name suggests Vercel dependency (but it's not required)
   - Might confuse team members

3. **Newer Than LangChain**
   - Less mature ecosystem
   - Fewer examples/plugins

---

## Comparison Table

| Feature | Custom | Vercel AI SDK | LangChain |
|--------|--------|---------------|-----------|
| **Size** | ~10KB | ~50KB | ~5MB |
| **Provider Support** | Manual | 10+ providers | 100+ providers |
| **Type Safety** | Manual | Excellent | Good |
| **Streaming** | Manual | Built-in | Built-in |
| **Retries** | Manual | Built-in | Built-in |
| **Maintenance** | You | Vercel | Community |
| **Learning Curve** | Low | Low | High |
| **Flexibility** | High | Medium | High |
| **Documentation** | You write | Excellent | Extensive |
| **Community** | None | Growing | Large |

---

## Updated Recommendation: **Vercel AI SDK**

### Why Vercel AI SDK Wins

1. **Best Balance**: Lightweight but feature-rich
2. **Type Safety**: Excellent TypeScript support
3. **Maintenance**: Actively maintained by Vercel
4. **Streaming**: Built-in streaming support (useful for future features)
5. **Future-Proof**: Easy to add new providers
6. **Time Savings**: No need to build retry logic, error handling, etc.

### Implementation with Vercel AI SDK

```typescript
// packages/shared/src/llm/client.ts
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, streamText } from 'ai';
import type { LLMProvider, LLMCompletionOptions, LLMCompletionResponse } from './types';

@injectable()
export class LLMService {
  private getModel(provider: LLMProvider, model: string) {
    switch (provider) {
      case 'openai':
        return openai(model);
      case 'anthropic':
        return anthropic(model);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  async complete(options: LLMCompletionOptions & { provider: LLMProvider }): Promise<LLMCompletionResponse> {
    const model = this.getModel(options.provider, options.model);

    const result = await generateText({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0,
      maxTokens: options.maxTokens,
      ...(options.responseFormat === 'json' && {
        responseFormat: { type: 'json_object' },
      }),
    });

    return {
      content: result.text,
      model: result.modelId,
      usage: {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      },
      finishReason: result.finishReason as 'stop' | 'length' | 'content_filter',
    };
  }

  async *stream(options: LLMCompletionOptions & { provider: LLMProvider }): AsyncIterable<string> {
    const model = this.getModel(options.provider, options.model);

    const result = await streamText({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0,
      maxTokens: options.maxTokens,
    });

    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }
}
```

### Usage Example

```typescript
// In analysis service
import { LLMService } from '@crm/shared';

class EmailAnalysisService {
  constructor(private llm: LLMService) {}

  async analyzeSentiment(email: Email) {
    const response = await this.llm.complete({
      provider: 'anthropic',
      model: 'claude-haiku-3.5',
      messages: [
        { role: 'system', content: 'You are a sentiment analyzer...' },
        { role: 'user', content: `Analyze: ${email.body}` },
      ],
      temperature: 0,
      maxTokens: 100,
      responseFormat: 'json',
    });

    return JSON.parse(response.content);
  }
}
```

### Package Installation

```bash
pnpm add ai @ai-sdk/openai @ai-sdk/anthropic
```

---

## Final Recommendation

**Use Vercel AI SDK** because:

1. ✅ **Lightweight** (~50KB vs custom's ~10KB, but saves development time)
2. ✅ **Type-Safe** (Excellent TypeScript support)
3. ✅ **Maintained** (Active development by Vercel)
4. ✅ **Feature-Rich** (Streaming, retries, error handling built-in)
5. ✅ **Provider-Agnostic** (Easy to switch/add providers)
6. ✅ **Future-Proof** (Streaming support for auto-responses later)

**Trade-off**: Slightly larger bundle size, but saves significant development time and provides better features out of the box.

---

## Migration Path

If you start with custom and want to migrate later:

1. Vercel AI SDK has similar API structure
2. Can wrap Vercel SDK in your existing interface
3. Gradual migration possible
4. Both approaches are compatible

**Recommendation**: Start with Vercel AI SDK from the beginning to avoid migration overhead.
