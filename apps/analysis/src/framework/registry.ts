import { injectable } from 'tsyringe';
import type { AnalysisDefinition } from './types';
import type { AnalysisType } from '@crm/shared';
import { logger } from '../utils/logger';
import { allAnalysisDefinitions } from '../analyses/definitions';

/**
 * Registry for analysis definitions
 * Allows registration and retrieval of analysis definitions
 */
@injectable()
export class AnalysisRegistry {
  private definitions: Map<AnalysisType, AnalysisDefinition> = new Map();

  /**
   * Register an analysis definition
   */
  register(definition: AnalysisDefinition): void {
    if (this.definitions.has(definition.type)) {
      logger.warn({ type: definition.type }, 'Overwriting existing analysis definition');
    }
    
    this.definitions.set(definition.type, definition);
    logger.debug({ type: definition.type, name: definition.name }, 'Registered analysis definition');
  }

  /**
   * Register multiple analysis definitions
   */
  registerAll(definitions: AnalysisDefinition[]): void {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  /**
   * Get an analysis definition by type
   */
  get(type: AnalysisType): AnalysisDefinition | undefined {
    return this.definitions.get(type);
  }

  /**
   * Get all registered analysis definitions
   */
  getAll(): AnalysisDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Get enabled analyses based on tenant config
   * Returns definitions for analyses that are enabled in the config
   */
  getEnabledAnalyses(enabledTypes: AnalysisType[]): AnalysisDefinition[] {
    const enabled: AnalysisDefinition[] = [];
    
    for (const type of enabledTypes) {
      const definition = this.get(type);
      if (definition) {
        enabled.push(definition);
      } else {
        logger.warn({ type }, 'Enabled analysis type not found in registry');
      }
    }
    
    return enabled;
  }

  /**
   * Check if an analysis type is registered
   */
  has(type: AnalysisType): boolean {
    return this.definitions.has(type);
  }

  /**
   * Get count of registered definitions
   */
  size(): number {
    return this.definitions.size;
  }

  /**
   * Clear all registered definitions (useful for testing)
   */
  clear(): void {
    this.definitions.clear();
  }
}

/**
 * Singleton instance of AnalysisRegistry
 * Initialized with all analysis definitions
 */
export const analysisRegistry = new AnalysisRegistry();

// Initialize registry with all definitions
analysisRegistry.registerAll(allAnalysisDefinitions);

logger.info({ count: analysisRegistry.size() }, 'Analysis registry initialized with definitions');
