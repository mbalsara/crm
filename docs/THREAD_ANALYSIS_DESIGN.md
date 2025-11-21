# Thread Analysis Design

## Overview

Thread analysis creates and maintains thread-level summaries that act as "memory" for the full conversation. These summaries are used as context when analyzing new emails in the thread, rather than passing all raw emails.

## Goals

1. **Thread Memory**: Maintain summaries of the conversation history
2. **Context Efficiency**: Use summaries instead of raw emails to reduce token usage
3. **Per-Analysis Summaries**: Each analysis type has its own thread-level summary
4. **Incremental Updates**: Update summaries when new emails are analyzed

## Architecture

### Current Flow (Without Thread Analysis)
```
New Email → Fetch all thread emails → Build raw context → Analyze
```

### Proposed Flow (With Thread Analysis)
```
New Email → Fetch thread summary → Use summary as context → Analyze → Update thread summary
```

## Database Schema

### Thread Analysis Table

```sql
CREATE TABLE thread_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Analysis type (sentiment, escalation, churn, etc.)
    analysis_type VARCHAR(50) NOT NULL,
    
    -- Thread summary for this analysis type
    summary TEXT NOT NULL, -- LLM-generated summary of thread for this analysis type
    
    -- Analysis metadata
    last_analyzed_email_id UUID REFERENCES emails(id), -- Last email included in summary
    last_analyzed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Model and version used for summary
    model_used VARCHAR(100),
    summary_version VARCHAR(20) DEFAULT 'v1.0',
    
    -- Token usage tracking
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    
    -- Metadata
    metadata JSONB, -- Additional context, confidence scores, etc.
    
    -- Tracking
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uniq_thread_analysis_type UNIQUE (thread_id, analysis_type)
);

CREATE INDEX idx_thread_analyses_thread ON thread_analyses(thread_id);
CREATE INDEX idx_thread_analyses_tenant_type ON thread_analyses(tenant_id, analysis_type);
CREATE INDEX idx_thread_analyses_last_analyzed ON thread_analyses(last_analyzed_at);
```

## Thread Summary Structure

### Per-Analysis-Type Summaries

Each analysis type maintains its own thread summary:

**Sentiment Summary Example:**
```
Thread sentiment trend: Started neutral in message 1. Became positive in messages 2-3 
with customer expressing satisfaction. Shifted to negative in message 4 with complaint 
about feature. Current state: Mixed sentiment, customer frustrated but still engaged.
```

**Escalation Summary Example:**
```
Escalation timeline: No escalation in first 3 messages. Escalation detected in message 4 
regarding billing issue. Issue escalated further in message 5 with threat to cancel. 
Resolution attempted in message 6. Current status: Escalation ongoing, high priority.
```

**Churn Summary Example:**
```
Churn risk evolution: Low risk initially. Risk increased in message 3 with mention of 
competitor. High risk in message 5 with cancellation request. Risk remains high but 
customer agreed to discuss in message 6. Current: High churn risk, intervention needed.
```

## Implementation Flow

### 1. When Analyzing New Email

```typescript
async analyzeEmail(emailId: string, threadId: string) {
  // Step 1: Get existing thread summaries (if any)
  const threadSummaries = await threadAnalysisRepo.getByThread(threadId);
  
  // Step 2: Build context from summaries (not raw emails)
  const threadContext = buildContextFromSummaries(threadSummaries);
  
  // Step 3: Analyze email with thread context
  const results = await executeAnalyses(email, threadContext);
  
  // Step 4: Update thread summaries with new email
  await updateThreadSummaries(threadId, email, results);
}
```

### 2. Building Context from Summaries

```typescript
function buildContextFromSummaries(summaries: ThreadAnalysis[]): string {
  const contextParts: string[] = [];
  
  contextParts.push('Thread Summary (Conversation Memory):\n');
  
  for (const summary of summaries) {
    contextParts.push(`\n[${summary.analysisType.toUpperCase()} Summary]`);
    contextParts.push(summary.summary);
    contextParts.push(`(Last updated: ${summary.lastAnalyzedAt})`);
  }
  
  return contextParts.join('\n');
}
```

### 3. Updating Thread Summaries

```typescript
async updateThreadSummaries(
  threadId: string,
  newEmail: Email,
  analysisResults: Record<string, any>
) {
  // For each analysis type that was run
  for (const [analysisType, result] of Object.entries(analysisResults)) {
    // Get existing summary (if any)
    const existing = await threadAnalysisRepo.getByThreadAndType(threadId, analysisType);
    
    // Generate updated summary using LLM
    const updatedSummary = await generateThreadSummary(
      analysisType,
      existing?.summary,
      newEmail,
      result
    );
    
    // Upsert thread analysis
    await threadAnalysisRepo.upsert({
      threadId,
      analysisType,
      summary: updatedSummary,
      lastAnalyzedEmailId: newEmail.id,
      lastAnalyzedAt: new Date(),
    });
  }
}
```

### 4. Generating Thread Summary

```typescript
async function generateThreadSummary(
  analysisType: string,
  existingSummary: string | null,
  newEmail: Email,
  newResult: any
): Promise<string> {
  const prompt = `Update the thread summary for ${analysisType} analysis.

${existingSummary ? `Current Summary:\n${existingSummary}\n\n` : 'No existing summary.\n\n'}

New Email:
Subject: ${newEmail.subject}
Body: ${newEmail.body?.substring(0, 1000)}
Date: ${newEmail.receivedAt}

Analysis Result:
${JSON.stringify(newResult, null, 2)}

Generate an updated thread summary that:
1. Incorporates the new email and analysis result
2. Maintains continuity with previous summary
3. Highlights trends and changes
4. Keeps summary concise (max 300 words)

Return only the updated summary text.`;

  const response = await llm.complete({
    model: 'gpt-4o-mini', // Use cheaper model for summarization
    messages: [
      { role: 'system', content: `You are a thread summarizer for ${analysisType} analysis.` },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    maxTokens: 500,
  });

  return response.content.trim();
}
```

## Benefits

1. **Token Efficiency**: Summaries are much smaller than raw emails
2. **Better Context**: LLM-generated summaries capture key insights
3. **Conversation Memory**: Thread summaries act as long-term memory
4. **Cost Reduction**: Less tokens = lower LLM costs
5. **Performance**: Faster analysis (smaller context)

## Integration Points

### In Email Analysis Service

```typescript
// apps/api/src/emails/analysis-service.ts

async executeAnalysis(options: AnalysisExecutionOptions) {
  // ... existing domain/contact extraction ...
  
  // Get thread summaries instead of raw emails
  const threadSummaries = await threadAnalysisRepo.getByThread(email.threadId);
  const threadContext = this.buildContextFromSummaries(threadSummaries);
  
  // Analyze with thread summaries as context
  const results = await this.analysisClient.analyze(tenantId, email, {
    threadContext,
    analysisTypes,
  });
  
  // Update thread summaries after analysis
  if (results.analysisResults) {
    await this.updateThreadSummaries(email.threadId, email, results.analysisResults);
  }
  
  return results;
}
```

## Migration Strategy

1. **Phase 1**: Add `thread_analyses` table
2. **Phase 2**: Implement summary generation logic
3. **Phase 3**: Update analysis service to use summaries
4. **Phase 4**: Backfill summaries for existing threads (optional)

## Open Questions

1. **Summary Length**: What's the optimal summary length? (proposed: 300 words)
2. **Update Frequency**: Update summary after every email or batch?
3. **Summary Expiration**: Should summaries expire or be regenerated periodically?
4. **Model Selection**: Which model for summarization? (proposed: gpt-4o-mini for cost)
5. **Fallback**: If no summary exists, fall back to raw emails?
