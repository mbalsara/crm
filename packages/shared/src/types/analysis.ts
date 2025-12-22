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
    'signature-extraction': true,   // Enable signature extraction
    'sentiment': true,               // Enable sentiment analysis
    'escalation': true,              // Enable escalation detection
    'upsell': false,                  // Enable upsell detection
    'churn': false,                   // Enable churn risk assessment
    'kudos': false,                   // Enable kudos detection
    'competitor': false,              // Enable competitor mentions
  },
  modelConfigs: {
    'domain-extraction': {
      primary: 'gemini-2.0-flash',
      fallback: 'gemini-1.5-flash',
    },
    'contact-extraction': {
      primary: 'gemini-2.0-flash',
      fallback: 'gemini-1.5-flash',
    },
    'signature-extraction': {
      primary: 'gemini-2.0-flash',
      fallback: 'gemini-1.5-flash',
    },
    'sentiment': {
      primary: 'gemini-2.0-flash',
      fallback: 'gemini-1.5-flash',
    },
    'escalation': {
      primary: 'gemini-2.0-flash',
      fallback: 'gemini-1.5-flash',
    },
    'upsell': {
      primary: 'gemini-2.0-flash',
      fallback: 'gemini-1.5-flash',
    },
    'churn': {
      primary: 'gemini-2.0-flash',
      fallback: 'gemini-1.5-flash',
    },
    'kudos': {
      primary: 'gemini-2.0-flash',
      fallback: 'gemini-1.5-flash',
    },
    'competitor': {
      primary: 'gemini-2.0-flash',
      fallback: 'gemini-1.5-flash',
    },
  },
  promptVersions: {
    'domain-extraction': 'v1.0',
    'contact-extraction': 'v1.0',
    'signature-extraction': 'v1.0',
    'sentiment': 'v1.1',
    'escalation': 'v1.0',
    'upsell': 'v1.0',
    'churn': 'v1.0',
    'kudos': 'v1.0',
    'competitor': 'v1.0',
  },
  analysisSettings: {
    'domain-extraction': {},
    'contact-extraction': {},
    'signature-extraction': {
      requireLLMIfRegexFieldsMissing: 2,
      alwaysUseLLM: false,
    },
    'sentiment': {},
    'escalation': {
      minConfidenceThreshold: 0.7,
    },
    'upsell': {
      minConfidenceThreshold: 0.6,
    },
    'churn': {
      minConfidenceThreshold: 0.7,
    },
    'kudos': {
      minConfidenceThreshold: 0.6,
    },
    'competitor': {
      minConfidenceThreshold: 0.6,
    },
  },
};
