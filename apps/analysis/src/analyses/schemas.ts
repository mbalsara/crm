import { z } from 'zod';

/**
 * Sentiment Analysis Schema
 */
export const sentimentSchema = z.object({
  value: z.enum(['positive', 'negative', 'neutral']),
  confidence: z.number().min(0).max(1),
});

export type SentimentResult = z.infer<typeof sentimentSchema>;

/**
 * Escalation Detection Schema
 */
export const escalationSchema = z.object({
  detected: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

export type EscalationResult = z.infer<typeof escalationSchema>;

/**
 * Upsell Detection Schema
 */
export const upsellSchema = z.object({
  detected: z.boolean(),
  confidence: z.number().min(0).max(1),
  opportunity: z.string().optional(), // Description of the upsell opportunity
  product: z.string().optional(), // Product/service mentioned
});

export type UpsellResult = z.infer<typeof upsellSchema>;

/**
 * Churn Risk Schema
 */
export const churnSchema = z.object({
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(1),
  indicators: z.array(z.string()).describe('Specific phrases or behaviors indicating churn risk'),
  reason: z.string().optional(),
});

export type ChurnResult = z.infer<typeof churnSchema>;

/**
 * Kudos Detection Schema
 */
export const kudosSchema = z.object({
  detected: z.boolean(),
  confidence: z.number().min(0).max(1),
  message: z.string().optional(), // The positive feedback message
  category: z.enum(['product', 'service', 'team', 'other']).optional(),
});

export type KudosResult = z.infer<typeof kudosSchema>;

/**
 * Competitor Mention Schema
 */
export const competitorSchema = z.object({
  detected: z.boolean(),
  confidence: z.number().min(0).max(1),
  competitors: z.array(z.string()).optional(), // List of competitor names mentioned
  context: z.string().optional(), // How competitors were mentioned
});

export type CompetitorResult = z.infer<typeof competitorSchema>;

/**
 * Signature Extraction Schema (already exists, re-export for consistency)
 * Note: This matches the schema in signature-extraction.ts
 */
export const signatureSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
  linkedin: z.string().optional(),
  twitter: z.string().optional(),
});

export type SignatureResult = z.infer<typeof signatureSchema>;

/**
 * Map of analysis type to schema for easy lookup
 */
export const analysisSchemas = {
  'sentiment': sentimentSchema,
  'escalation': escalationSchema,
  'upsell': upsellSchema,
  'churn': churnSchema,
  'kudos': kudosSchema,
  'competitor': competitorSchema,
  'signature-extraction': signatureSchema,
} as const;

/**
 * Helper to get schema by analysis type
 */
export function getAnalysisSchema(type: keyof typeof analysisSchemas): z.ZodSchema<any> {
  const schema = analysisSchemas[type];
  if (!schema) {
    throw new Error(`No schema found for analysis type: ${type}`);
  }
  return schema;
}
