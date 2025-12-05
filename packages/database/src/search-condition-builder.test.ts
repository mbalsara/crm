import { describe, it, expect } from 'vitest';
import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { SearchOperator, ValidationError } from '@crm/shared';
import { escapeLikePattern, buildCondition } from './search-condition-builder';

// Mock table for testing
const testTable = pgTable('test', {
  id: text('id').primaryKey(),
  name: text('name'),
  age: integer('age'),
  createdAt: timestamp('created_at'),
});

describe('escapeLikePattern', () => {
  it('wraps simple value with %', () => {
    expect(escapeLikePattern('john')).toBe('%john%');
  });

  it('escapes % character', () => {
    expect(escapeLikePattern('100%')).toBe('%100\\%%');
  });

  it('escapes _ character', () => {
    expect(escapeLikePattern('test_value')).toBe('%test\\_value%');
  });

  it('escapes backslash character', () => {
    expect(escapeLikePattern('path\\file')).toBe('%path\\\\file%');
  });

  it('escapes multiple special characters', () => {
    expect(escapeLikePattern('100%_test\\')).toBe('%100\\%\\_test\\\\%');
  });

  it('handles empty string', () => {
    expect(escapeLikePattern('')).toBe('%%');
  });

  it('handles string with only special characters', () => {
    expect(escapeLikePattern('%_%')).toBe('%\\%\\_\\%%');
  });
});

describe('buildCondition', () => {
  describe('equality operators', () => {
    it('builds eq condition', () => {
      const result = buildCondition(testTable.name, 'eq', 'test');
      expect(result).toBeDefined();
    });

    it('builds eq condition with SearchOperator enum', () => {
      const result = buildCondition(testTable.name, SearchOperator.EQUALS, 'test');
      expect(result).toBeDefined();
    });

    it('builds ne condition', () => {
      const result = buildCondition(testTable.name, 'ne', 'test');
      expect(result).toBeDefined();
    });

    it('builds ne condition with SearchOperator enum', () => {
      const result = buildCondition(testTable.name, SearchOperator.NOT_EQUALS, 'test');
      expect(result).toBeDefined();
    });
  });

  describe('comparison operators', () => {
    it('builds gt condition', () => {
      const result = buildCondition(testTable.age, 'gt', 18);
      expect(result).toBeDefined();
    });

    it('builds gt condition with SearchOperator enum', () => {
      const result = buildCondition(testTable.age, SearchOperator.GREATER_THAN, 18);
      expect(result).toBeDefined();
    });

    it('builds gte condition', () => {
      const result = buildCondition(testTable.age, 'gte', 18);
      expect(result).toBeDefined();
    });

    it('builds gte condition with SearchOperator enum', () => {
      const result = buildCondition(testTable.age, SearchOperator.GREATER_THAN_OR_EQUAL, 18);
      expect(result).toBeDefined();
    });

    it('builds lt condition', () => {
      const result = buildCondition(testTable.age, 'lt', 65);
      expect(result).toBeDefined();
    });

    it('builds lt condition with SearchOperator enum', () => {
      const result = buildCondition(testTable.age, SearchOperator.LESS_THAN, 65);
      expect(result).toBeDefined();
    });

    it('builds lte condition', () => {
      const result = buildCondition(testTable.age, 'lte', 65);
      expect(result).toBeDefined();
    });

    it('builds lte condition with SearchOperator enum', () => {
      const result = buildCondition(testTable.age, SearchOperator.LESS_THAN_OR_EQUAL, 65);
      expect(result).toBeDefined();
    });

    it('builds condition with Date value', () => {
      const date = new Date('2024-01-01');
      const result = buildCondition(testTable.createdAt, 'gte', date);
      expect(result).toBeDefined();
    });
  });

  describe('like operators', () => {
    it('builds like condition with escaped pattern', () => {
      const result = buildCondition(testTable.name, 'like', 'john');
      expect(result).toBeDefined();
    });

    it('builds like condition with SearchOperator enum', () => {
      const result = buildCondition(testTable.name, SearchOperator.LIKE, 'john');
      expect(result).toBeDefined();
    });

    it('builds ilike condition with escaped pattern', () => {
      const result = buildCondition(testTable.name, 'ilike', 'john');
      expect(result).toBeDefined();
    });

    it('builds ilike condition with SearchOperator enum', () => {
      const result = buildCondition(testTable.name, SearchOperator.ILIKE, 'john');
      expect(result).toBeDefined();
    });

    it('throws ValidationError for like with non-string value', () => {
      expect(() => buildCondition(testTable.name, 'like', 123)).toThrow(ValidationError);
      expect(() => buildCondition(testTable.name, 'like', 123)).toThrow('LIKE operator requires string value');
    });

    it('throws ValidationError for ilike with non-string value', () => {
      expect(() => buildCondition(testTable.name, 'ilike', null)).toThrow(ValidationError);
      expect(() => buildCondition(testTable.name, 'ilike', null)).toThrow('ILIKE operator requires string value');
    });
  });

  describe('array operators', () => {
    it('builds in condition with array', () => {
      const result = buildCondition(testTable.name, 'in', ['a', 'b', 'c']);
      expect(result).toBeDefined();
    });

    it('builds in condition with SearchOperator enum', () => {
      const result = buildCondition(testTable.name, SearchOperator.IN, ['a', 'b']);
      expect(result).toBeDefined();
    });

    it('returns undefined for in with empty array', () => {
      const result = buildCondition(testTable.name, 'in', []);
      expect(result).toBeUndefined();
    });

    it('builds notIn condition with array', () => {
      const result = buildCondition(testTable.name, 'notIn', ['x', 'y']);
      expect(result).toBeDefined();
    });

    it('builds notIn condition with SearchOperator enum', () => {
      const result = buildCondition(testTable.name, SearchOperator.NOT_IN, ['x']);
      expect(result).toBeDefined();
    });

    it('returns undefined for notIn with empty array', () => {
      const result = buildCondition(testTable.name, 'notIn', []);
      expect(result).toBeUndefined();
    });
  });

  describe('null operators', () => {
    it('builds isNull condition', () => {
      const result = buildCondition(testTable.name, 'isNull', null);
      expect(result).toBeDefined();
    });

    it('builds isNotNull condition', () => {
      const result = buildCondition(testTable.name, 'isNotNull', null);
      expect(result).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('throws ValidationError for unknown operator', () => {
      expect(() => buildCondition(testTable.name, 'unknown', 'value')).toThrow(ValidationError);
      expect(() => buildCondition(testTable.name, 'unknown', 'value')).toThrow('Unknown operator: unknown');
    });

    it('throws ValidationError for invalid operator', () => {
      expect(() => buildCondition(testTable.name, 'contains', 'value')).toThrow(ValidationError);
    });
  });
});
