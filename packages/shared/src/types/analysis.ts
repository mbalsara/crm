/**
 * Analysis framework types
 * Shared types for the modular analysis system
 */

/**
 * Analysis types that can be enabled/disabled per tenant
 */
export type AnalysisType =
  | 'domain-extraction'      // Always run (sync)
  | 'contact-extraction'     // Always run (sync)
  | 'signature-extraction'   // Conditional (if signature detected)
  | 'sentiment'              // Conditional (if enabled)
  | 'escalation'             // Conditional (if enabled)
  | 'upsell'                 // Conditional (if enabled)
  | 'churn'                  // Conditional (if enabled)
  | 'kudos'                  // Conditional (if enabled)
  | 'competitor';            // Conditional (if enabled)

/**
 * Model configuration with primary and optional fallback
 */
export interface ModelConfig {
  primary: string;    // e.g., 'gemini-2.5-pro'
  fallback?: string;  // e.g., 'gpt-4o-mini' (optional)
}

/**
 * Analysis-specific settings
 */
export interface AnalysisSettings {
  requireThreadContext?: boolean;
  minConfidenceThreshold?: number;
  requireLLMIfRegexFieldsMissing?: number;
  alwaysUseLLM?: boolean;
  timeout?: number;
  maxRetries?: number;
  priority?: number;
}

/**
 * Complete analysis configuration for a tenant
 */
export interface AnalysisConfig {
  tenantId: string;
  enabledAnalyses: Record<AnalysisType, boolean>;
  modelConfigs: Record<AnalysisType, ModelConfig>;
  promptVersions: Record<AnalysisType, string>;
  customPrompts?: Record<AnalysisType, string>;
  analysisSettings: Record<AnalysisType, AnalysisSettings>;
}

/**
 * Default analysis configuration
 */
export const DEFAULT_ANALYSIS_CONFIG: Omit<AnalysisConfig, 'tenantId'> = {
  enabledAnalyses: {
    'domain-extraction': true,      // Always enabled
    'contact-extraction': true,     // Always enabled
    'signature-extraction': false,
    'sentiment': false,
    'escalation': false,
    'upsell': false,
    'churn': false,
    'kudos': false,
    'competitor': false,
  },
  modelConfigs: {
    'domain-extraction': {
      primary: 'gemini-2.5-pro',
      fallback: 'gpt-4o-mini',
    },
    'contact-extraction': {
      primary: 'gemini-2.5-pro',
      fallback: 'gpt-4o-mini',
    },
    'signature-extraction': {
      primary: 'gemini-2.5-pro',
      fallback: 'gpt-4o-mini',
    },
    'sentiment': {
      primary: 'gemini-2.5-pro',
      fallback: 'gpt-4o-mini',
    },
    'escalation': {
      primary: 'gemini-2.5-pro',
      fallback: 'gpt-4o-mini',
    },
    'upsell': {
      primary: 'gemini-2.5-pro',
      fallback: 'gpt-4o-mini',
    },
    'churn': {
      primary: 'gemini-2.5-pro',
      fallback: 'gpt-4o-mini',
    },
    'kudos': {
      primary: 'gemini-2.5-pro',
      fallback: 'gpt-4o-mini',
    },
    'competitor': {
      primary: 'gemini-2.5-pro',
      fallback: 'gpt-4o-mini',
    },
  },
  promptVersions: {
    'domain-extraction': 'v1.0',
    'contact-extraction': 'v1.0',
    'signature-extraction': 'v1.0',
    'sentiment': 'v1.0',
    'escalation': 'v1.0',
    'upsell': 'v1.0',
    'churn': 'v1.0',
    'kudos': 'v1.0',
    'competitor': 'v1.0',
  },
  analysisSettings: {
    'domain-extraction': {
      requireThreadContext: false,
    },
    'contact-extraction': {
      requireThreadContext: false,
    },
    'signature-extraction': {
      requireLLMIfRegexFieldsMissing: 2,
      alwaysUseLLM: false,
    },
    'sentiment': {
      requireThreadContext: false,
    },
    'escalation': {
      requireThreadContext: true,
      minConfidenceThreshold: 0.7,
    },
    'upsell': {
      requireThreadContext: false,
      minConfidenceThreshold: 0.6,
    },
    'churn': {
      requireThreadContext: true,
      minConfidenceThreshold: 0.7,
    },
    'kudos': {
      requireThreadContext: false,
      minConfidenceThreshold: 0.6,
    },
    'competitor': {
      requireThreadContext: false,
      minConfidenceThreshold: 0.6,
    },
  },
};
