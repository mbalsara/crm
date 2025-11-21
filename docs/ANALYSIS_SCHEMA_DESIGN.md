# Analysis Schema Design: Extracted Fields Strategy

## Problem

Different analysis types have different result structures:
- **Sentiment**: `{ value, confidence }`
- **Escalation**: `{ detected, confidence, reason, urgency }`
- **Churn**: `{ riskLevel, confidence, indicators, reason }`
- **Upsell**: `{ detected, confidence, opportunity, product }`

We can't index fields that don't exist in all analysis types when storing everything in a single JSONB column.

## Solution: Extract Common Fields to Columns

Extract commonly queried fields to separate columns while keeping the full result in JSONB.

### Benefits

1. **Indexable**: Can create indexes on extracted columns for fast queries
2. **Flexible**: Full result preserved in JSONB for any field access
3. **Queryable**: Can efficiently query without JSONB path operations
4. **Type-safe**: TypeScript types ensure correct field extraction

### Extracted Fields

| Field | Applies To | Type | Description |
|-------|-----------|------|-------------|
| `confidence` | All | DECIMAL(3,2) | Confidence score (0.00-1.00) |
| `detected` | escalation, upsell, kudos, competitor | BOOLEAN | Whether something was detected |
| `riskLevel` | churn | VARCHAR(20) | Risk level: 'low', 'medium', 'high', 'critical' |
| `urgency` | escalation | VARCHAR(20) | Urgency level: 'low', 'medium', 'high', 'critical' |
| `sentimentValue` | sentiment | VARCHAR(20) | Sentiment: 'positive', 'negative', 'neutral' |

**Note**: Fields are NULL when not applicable to the analysis type.

## Usage Pattern

### When Saving Analysis Results

```typescript
// Helper function to extract fields from result
function extractFields(analysisType: AnalysisType, result: AnalysisResult) {
  const extracted: Partial<NewEmailAnalysis> = {
    confidence: extractConfidence(result),
  };

  // Extract type-specific fields
  switch (analysisType) {
    case 'sentiment':
      if ('value' in result) {
        extracted.sentimentValue = result.value;
      }
      break;
    
    case 'escalation':
      if ('detected' in result) {
        extracted.detected = result.detected;
      }
      if ('urgency' in result) {
        extracted.urgency = result.urgency;
      }
      break;
    
    case 'churn':
      if ('riskLevel' in result) {
        extracted.riskLevel = result.riskLevel;
      }
      break;
    
    case 'upsell':
    case 'kudos':
    case 'competitor':
      if ('detected' in result) {
        extracted.detected = result.detected;
      }
      break;
  }

  return extracted;
}

// Save analysis result
const analysisResult = await analysisClient.analyze(...);
const extractedFields = extractFields('escalation', analysisResult.result);

await db.insert(emailAnalyses).values({
  emailId,
  tenantId,
  analysisType: 'escalation',
  result: analysisResult.result, // Full result in JSONB
  ...extractedFields, // Extracted fields in columns
  modelUsed: analysisResult.modelUsed,
  totalTokens: analysisResult.usage?.totalTokens,
});
```

### Query Examples

```typescript
// Find all high-confidence escalations
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

// Find critical churn risks
const churnRisks = await db
  .select()
  .from(emailAnalyses)
  .where(
    and(
      eq(emailAnalyses.analysisType, 'churn'),
      eq(emailAnalyses.riskLevel, 'critical')
    )
  );

// Find positive sentiment emails
const positiveEmails = await db
  .select()
  .from(emailAnalyses)
  .where(
    and(
      eq(emailAnalyses.analysisType, 'sentiment'),
      eq(emailAnalyses.sentimentValue, 'positive')
    )
  );

// Get full result from JSONB when needed
const analysis = await db
  .select()
  .from(emailAnalyses)
  .where(eq(emailAnalyses.id, analysisId))
  .limit(1);

const fullResult = analysis[0].result; // Access full JSONB result
```

## Indexes

Indexes are created on extracted columns for efficient querying:

- `confidence` - For filtering by confidence threshold
- `detected` - For finding detected escalations/upsells/etc.
- `riskLevel` - For finding high-risk churn
- `urgency` - For finding urgent escalations
- `sentimentValue` - For filtering by sentiment
- Composite indexes: `(tenantId, analysisType, detected)`, `(tenantId, analysisType, riskLevel)`

## Trade-offs

### ✅ Advantages

1. **Fast queries**: Indexed columns enable efficient filtering
2. **Flexible storage**: Full result preserved in JSONB
3. **Type safety**: TypeScript ensures correct extraction
4. **Backward compatible**: Can add more extracted fields later

### ⚠️ Considerations

1. **Data duplication**: Fields stored in both JSONB and columns
2. **Extraction logic**: Need helper function to extract fields when saving
3. **NULL handling**: Fields are NULL when not applicable (expected behavior)

## Alternative Approaches Considered

### 1. JSONB GIN Indexes
- **Pros**: No schema changes needed
- **Cons**: Less efficient for specific field queries, can't index nested paths easily

### 2. Separate Tables Per Analysis Type
- **Pros**: Fully normalized, type-safe per table
- **Cons**: More complex queries, harder to add new analysis types

### 3. Single JSONB Column Only
- **Pros**: Simple schema
- **Cons**: Can't efficiently query/index specific fields

## Recommendation

**Use extracted fields approach** - Best balance of query performance and flexibility.
