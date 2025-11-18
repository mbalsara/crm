import type { AnalysisConfig } from '@crm/shared';
import { DEFAULT_ANALYSIS_CONFIG } from '@crm/shared';

/**
 * Configuration utility for analysis configs
 * Merges provided config with defaults (stateless - no database connection)
 */
export class AnalysisConfigLoader {
  /**
   * Merge provided config with defaults
   * Provided config values take precedence, but missing fields are filled from defaults
   */
  mergeWithDefaults(providedConfig: Partial<AnalysisConfig>): AnalysisConfig {
    const tenantId = providedConfig.tenantId || '';
    
    return {
      tenantId,
      enabledAnalyses: {
        ...DEFAULT_ANALYSIS_CONFIG.enabledAnalyses,
        ...providedConfig.enabledAnalyses,
      },
      modelConfigs: {
        ...DEFAULT_ANALYSIS_CONFIG.modelConfigs,
        ...providedConfig.modelConfigs,
      },
      promptVersions: {
        ...DEFAULT_ANALYSIS_CONFIG.promptVersions,
        ...providedConfig.promptVersions,
      },
      analysisSettings: {
        ...DEFAULT_ANALYSIS_CONFIG.analysisSettings,
        ...providedConfig.analysisSettings,
      },
      customPrompts: providedConfig.customPrompts,
    };
  }

  /**
   * Get enabled analysis types from config
   * Convenience method that extracts enabled types
   */
  getEnabledAnalysisTypes(config: AnalysisConfig): string[] {
    return Object.entries(config.enabledAnalyses)
      .filter(([_, enabled]) => enabled)
      .map(([type, _]) => type);
  }
}
