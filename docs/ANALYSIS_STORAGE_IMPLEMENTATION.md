# Analysis Storage Implementation Summary

## ✅ Completed Implementation

### 1. SQL Schema (`sql/email_analyses.sql`)
- Created `email_analyses` table with extracted fields for indexing
- Includes indexes on all extracted fields
- Updated `sql/README.md` with execution order

### 2. Drizzle Schema (`apps/api/src/emails/analysis-schema.ts`)
- Defined `emailAnalyses` table with:
  - Core fields: `emailId`, `tenantId`, `analysisType`, `result` (JSONB)
  - Extracted fields: `confidence`, `detected`, `riskLevel`, `urgency`, `sentimentValue`
  - Metadata: `modelUsed`, `reasoning`, token usage fields
- Exported types: `AnalysisType`, `AnalysisResult`, `EmailAnalysis`, `NewEmailAnalysis`
- Added to schema exports (`apps/api/src/schemas.ts`)

### 3. Repository (`apps/api/src/emails/analysis-repository.ts`)
- `upsertAnalysis()` - Save/update single analysis result
- `upsertAnalyses()` - Save/update multiple results (transactional)
- `getAnalysis()` - Get analysis by email and type
- `getAnalysesByEmail()` - Get all analyses for an email
- `getAnalysesByTenantAndType()` - Query analyses by tenant and type
- `deleteAnalysis()` - Delete analysis result

### 4. Helper Utilities (`apps/api/src/emails/analysis-utils.ts`)
- `extractAnalysisFields()` - Extracts commonly queried fields from result
- `createEmailAnalysisRecord()` - Creates complete record ready for insertion

### 5. DI Container (`apps/api/src/di/container.ts`)
- Registered `EmailAnalysisRepository`
- Added `emailAnalyses` schema to database initialization

### 6. Inngest Function (`apps/api/src/inngest/functions.ts`)
- Updated to save analysis results after completion
- Extracts fields and saves to database in a durable step
- Comprehensive logging for debugging

## Schema Structure

```typescript
emailAnalyses {
  id: UUID (PK)
  emailId: UUID (FK → emails, CASCADE delete)
  tenantId: UUID (FK → tenants)
  analysisType: VARCHAR(50) // 'sentiment', 'escalation', etc.
  result: JSONB // Full analysis result
  
  // Extracted fields (for indexing)
  confidence: DECIMAL(3,2) // All types
  detected: BOOLEAN // escalation, upsell, kudos, competitor
  riskLevel: VARCHAR(20) // churn
  urgency: VARCHAR(20) // escalation
  sentimentValue: VARCHAR(20) // sentiment
  
  // Metadata
  modelUsed: VARCHAR(100)
  reasoning: TEXT
  promptTokens: INTEGER
  completionTokens: INTEGER
  totalTokens: INTEGER
  
  // Timestamps
  createdAt: TIMESTAMP
  updatedAt: TIMESTAMP
}
```

## Usage Flow

1. **Email inserted** → Inngest event triggered
2. **Inngest function executes**:
   - Domain extraction (saves to `customers` table)
   - Contact extraction (saves to `contacts` table)
   - Other analyses (sentiment, escalation, etc.)
3. **Analysis results saved**:
   - Results extracted using `createEmailAnalysisRecord()`
   - Fields extracted for indexing
   - Saved via `EmailAnalysisRepository.upsertAnalyses()`

## Query Examples

```typescript
// Get all analyses for an email
const analyses = await analysisRepo.getAnalysesByEmail(emailId);

// Get high-confidence escalations
const escalations = await db
  .select()
  .from(emailAnalyses)
  .where(
    and(
      eq(emailAnalyses.analysisType, 'escalation'),
      eq(emailAnalyses.detected, true),
      gte(emailAnalyses.confidence, 0.9)
    )
  );

// Get critical churn risks
const churnRisks = await db
  .select()
  .from(emailAnalyses)
  .where(
    and(
      eq(emailAnalyses.analysisType, 'churn'),
      eq(emailAnalyses.riskLevel, 'critical')
    )
  );
```

## Testing Checklist

- [ ] Run SQL migration: `psql $DATABASE_URL -f sql/email_analyses.sql`
- [ ] Verify table created: `SELECT * FROM email_analyses LIMIT 1;`
- [ ] Test analysis flow: Insert email → Check if results are saved
- [ ] Verify extracted fields: Check that `confidence`, `detected`, etc. are populated
- [ ] Test queries: Query by `detected`, `riskLevel`, `sentimentValue`
- [ ] Verify indexes: Check query performance with EXPLAIN ANALYZE

## Next Steps

1. **Run SQL migration** to create the table
2. **Test the flow** by inserting an email and checking if analysis results are saved
3. **Iterate on schema** based on query patterns and performance needs
4. **Add API routes** to query analysis results if needed
