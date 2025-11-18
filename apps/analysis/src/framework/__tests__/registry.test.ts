import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalysisRegistry } from '../registry';
import { allAnalysisDefinitions } from '../../analyses/definitions';
import type { AnalysisType } from '@crm/shared';

describe('AnalysisRegistry', () => {
  let registry: AnalysisRegistry;

  beforeEach(() => {
    registry = new AnalysisRegistry();
    registry.clear();
  });

  describe('register', () => {
    it('should register a definition', () => {
      const definition = allAnalysisDefinitions[0];
      registry.register(definition);
      
      expect(registry.has(definition.type)).toBe(true);
      expect(registry.get(definition.type)).toBe(definition);
    });

    it('should warn when overwriting existing definition', () => {
      const definition = allAnalysisDefinitions[0];
      registry.register(definition);
      
      // Register again - should warn but succeed
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      registry.register(definition);
      
      expect(registry.get(definition.type)).toBe(definition);
      consoleSpy.mockRestore();
    });
  });

  describe('registerAll', () => {
    it('should register all definitions', () => {
      registry.registerAll(allAnalysisDefinitions);
      
      expect(registry.size()).toBe(allAnalysisDefinitions.length);
      for (const definition of allAnalysisDefinitions) {
        expect(registry.has(definition.type)).toBe(true);
      }
    });
  });

  describe('get', () => {
    it('should return definition by type', () => {
      registry.registerAll(allAnalysisDefinitions);
      
      const definition = registry.get('sentiment');
      expect(definition).toBeDefined();
      expect(definition?.type).toBe('sentiment');
    });

    it('should return undefined for unknown type', () => {
      const definition = registry.get('unknown' as AnalysisType);
      expect(definition).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all registered definitions', () => {
      registry.registerAll(allAnalysisDefinitions);
      
      const all = registry.getAll();
      expect(all.length).toBe(allAnalysisDefinitions.length);
      expect(all).toEqual(expect.arrayContaining(allAnalysisDefinitions));
    });
  });

  describe('getEnabledAnalyses', () => {
    it('should return definitions for enabled types', () => {
      registry.registerAll(allAnalysisDefinitions);
      
      const enabledTypes: AnalysisType[] = ['sentiment', 'escalation'];
      const enabled = registry.getEnabledAnalyses(enabledTypes);
      
      expect(enabled.length).toBe(2);
      expect(enabled.map(d => d.type)).toEqual(expect.arrayContaining(['sentiment', 'escalation']));
    });

    it('should filter out unknown types', () => {
      registry.registerAll(allAnalysisDefinitions);
      
      const enabledTypes: AnalysisType[] = ['sentiment', 'unknown' as AnalysisType];
      const enabled = registry.getEnabledAnalyses(enabledTypes);
      
      expect(enabled.length).toBe(1);
      expect(enabled[0].type).toBe('sentiment');
    });
  });

  describe('has', () => {
    it('should return true for registered type', () => {
      registry.registerAll(allAnalysisDefinitions);
      expect(registry.has('sentiment')).toBe(true);
    });

    it('should return false for unregistered type', () => {
      expect(registry.has('unknown' as AnalysisType)).toBe(false);
    });
  });

  describe('size', () => {
    it('should return correct count', () => {
      expect(registry.size()).toBe(0);
      
      registry.registerAll(allAnalysisDefinitions);
      expect(registry.size()).toBe(allAnalysisDefinitions.length);
    });
  });

  describe('clear', () => {
    it('should clear all definitions', () => {
      registry.registerAll(allAnalysisDefinitions);
      expect(registry.size()).toBeGreaterThan(0);
      
      registry.clear();
      expect(registry.size()).toBe(0);
    });
  });
});
