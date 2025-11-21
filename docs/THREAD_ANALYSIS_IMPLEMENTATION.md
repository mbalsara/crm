# Thread Analysis Implementation Summary

## Overview

Thread analysis system has been implemented to maintain thread-level summaries that act as "memory" for conversations. These summaries are used as context when analyzing new emails, reducing token usage and improving analysis quality.

## Implementation

### 1. Database Schema

**File**: `sql/thread_analyses.sql`

- Created `thread_analyses` table to store per-analysis-type summaries
- Unique constraint: `(thread_id, analysis_type)` - one summary per thread per analysis type
- Foreign key to `email_threads` with CASCADE delete
- Tracks: summary text, last analyzed email, model used, token usage, metadata

### 2. Drizzle Schema

**File**: `apps/api/src/emails/thread-analysis-schema.ts`

- Drizzle ORM schema matching SQL structure
- Exported types: `ThreadAnalysis`, `NewThreadAnalysis`
- Registered in DI container and database initialization

### 3. Repository

**File**: `apps/api/src/emails/thread-analysis-repository.ts`

- `getByThreadAndType()` - Get summary for specific analysis type
- `getByThread()` - Get all summaries for a thread
- `upsert()` - Insert or update summary
- `delete()` - Delete specific summary
- `deleteByThread()` - Delete all summaries for a thread

### 4. Service

**File**: `apps/api/src/emails/thread-analysis-service.ts`

**Key Methods:**
- `getThreadContext()` - Fetches thread summaries and builds context string
- `updateThreadSummaries()` - Updates summaries after analyzing new email
- `generateThreadSummary()` - Uses LLM to generate/update summaries

**Context Building:**
- Formats summaries into readable context string
- Includes analysis type labels and last updated timestamps
- Falls back gracefully if no summaries exist

**Summary Generation:**
- Uses analysis service's `/api/analysis/summarize` endpoint
- Incorporates existing summary + new email + analysis result
- Uses cheaper model (`gpt-4o-mini`) for summarization
- Falls back to simple summary if LLM fails

### 5. Analysis Service Integration

**File**: `apps/api/src/emails/analysis-service.ts`

**Updated Flow:**
1. **Get Thread Context**: Fetches thread summaries (if `useThreadSummaries=true`)
2. **Fallback**: Uses provided `threadContext` if summaries don't exist
3. **Execute Analysis**: Runs analysis with thread summaries as context
4. **Update Summaries**: After analysis completes, updates thread summaries

**Key Changes:**
- Added `threadId` parameter (required)
- Added `useThreadSummaries` flag (default: true)
- Thread summaries fetched automatically if enabled
- Summaries updated after analysis completes

### 6. Analysis Service Endpoint

**File**: `apps/analysis/src/routes/analysis.ts`

- Added `POST /api/analysis/summarize` endpoint
- Accepts: `analysisType`, `prompt`, `model` (optional)
- Uses `AIService.generateText()` to generate summary
- Returns: `summary`, `modelUsed`, `tokens`

### 7. Client Integration

**File**: `packages/clients/src/analysis/client.ts`

- Added `summarizeThread()` method
- Calls `/api/analysis/summarize` endpoint
- Returns summary with token usage

### 8. API Route Updates

**File**: `apps/api/src/emails/routes.ts`

- Updated to pass `threadId` to `executeAnalysis()`
- Sets `useThreadSummaries: true`
- Still builds raw thread context as fallback

### 9. Inngest Function Updates

**File**: `apps/api/src/emails/inngest/functions.ts`

- Updated to pass `threadId` to `executeAnalysis()`
- Sets `useThreadSummaries: true`
- Still builds raw thread context as fallback

## Flow Diagram

```
New Email Analysis
    │
    ▼
EmailAnalysisService.executeAnalysis()
    │
    ├─► Fetch Thread Summaries (if useThreadSummaries=true)
    │   └─► ThreadAnalysisService.getThreadContext()
    │       └─► Returns formatted context string
    │
    ├─► Execute Analysis with Thread Summaries as Context
    │   └─► analysisClient.analyze(threadContext=summaries)
    │
    └─► Update Thread Summaries (after analysis completes)
        └─► ThreadAnalysisService.updateThreadSummaries()
            └─► For each analysis type:
                ├─► Get existing summary
                ├─► Generate updated summary via LLM
                └─► Upsert thread_analyses record
```

## Benefits

1. **Token Efficiency**: Summaries are much smaller than raw emails
2. **Better Context**: LLM-generated summaries capture key insights and trends
3. **Conversation Memory**: Thread summaries act as long-term memory
4. **Cost Reduction**: Less tokens = lower LLM costs
5. **Performance**: Faster analysis with smaller context

## Usage

### First Email in Thread
- No summaries exist yet
- Falls back to raw thread context (if provided)
- After analysis, creates first summaries

### Subsequent Emails
- Fetches existing thread summaries
- Uses summaries as context for analysis
- Updates summaries with new email and analysis result

### Example Context String

```
Thread Summary (Conversation Memory):

[SENTIMENT Summary]
Thread sentiment trend: Started neutral in message 1. Became positive in messages 2-3 
with customer expressing satisfaction. Shifted to negative in message 4 with complaint 
about feature. Current state: Mixed sentiment, customer frustrated but still engaged.
(Last updated: 2025-01-21T21:33:58.809Z)
---

[ESCALATION Summary]
Escalation timeline: No escalation in first 3 messages. Escalation detected in message 4 
regarding billing issue. Issue escalated further in message 5 with threat to cancel. 
Resolution attempted in message 6. Current status: Escalation ongoing, high priority.
(Last updated: 2025-01-21T21:33:58.809Z)
---
```

## Database Migration

Run the SQL migration:

```bash
psql $DATABASE_URL -f sql/thread_analyses.sql
```

Or include it in the execution order (after `emails.sql`, before `email_analyses.sql`).

## Testing

1. **Run SQL migration** to create `thread_analyses` table
2. **Analyze first email** in a thread - should create initial summaries
3. **Analyze second email** in same thread - should use summaries as context
4. **Check database** - verify summaries are created/updated in `thread_analyses` table
5. **Verify context** - check logs to see thread summaries being used

## Future Enhancements

1. **Summary Expiration**: Regenerate summaries periodically
2. **Summary Compression**: Further optimize summary length
3. **Batch Updates**: Update multiple summaries in single LLM call
4. **Summary Versioning**: Track summary versions for A/B testing
5. **Custom Summarization Models**: Allow tenant-specific models for summarization
