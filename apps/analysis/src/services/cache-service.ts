import { eq, and, gt, lt } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { logger } from '../utils/logger';

const TTL_DAYS = 7;
const CLEANUP_PROBABILITY = 0.01; // 1% of requests trigger cleanup

/**
 * Cache service for storing and retrieving analysis results
 * Uses PostgreSQL with TTL enforced on read + lazy cleanup
 */
export class AnalysisCacheService {
  /**
   * Get cached analysis results
   * Returns null if not found or expired
   */
  async get(messageId: string, modelId: string): Promise<Record<string, any> | null> {
    try {
      const db = getDb();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - TTL_DAYS);

      const result = await db
        .select({ results: schema.analysisCache.results })
        .from(schema.analysisCache)
        .where(
          and(
            eq(schema.analysisCache.messageId, messageId),
            eq(schema.analysisCache.modelId, modelId),
            gt(schema.analysisCache.createdAt, cutoffDate)
          )
        )
        .limit(1);

      if (result.length > 0) {
        logger.info({ messageId, modelId }, 'Cache hit');
        return result[0].results as Record<string, any>;
      }

      logger.debug({ messageId, modelId }, 'Cache miss');

      // Opportunistic cleanup
      this.maybeCleanup();

      return null;
    } catch (error: any) {
      logger.error({ error: error.message, messageId, modelId }, 'Cache get failed');
      return null; // Fail open - continue without cache
    }
  }

  /**
   * Store analysis results in cache
   */
  async set(
    messageId: string,
    modelId: string,
    tenantId: string,
    results: Record<string, any>
  ): Promise<void> {
    try {
      const db = getDb();

      await db
        .insert(schema.analysisCache)
        .values({
          messageId,
          modelId,
          tenantId,
          results,
        })
        .onConflictDoUpdate({
          target: [schema.analysisCache.messageId, schema.analysisCache.modelId],
          set: {
            results,
            createdAt: new Date(),
          },
        });

      logger.info({ messageId, modelId }, 'Cache set');
    } catch (error: any) {
      logger.error({ error: error.message, messageId, modelId }, 'Cache set failed');
      // Fail silently - cache miss on next retry is acceptable
    }
  }

  /**
   * Probabilistic cleanup of expired entries
   * Called on ~1% of cache reads to avoid accumulating stale data
   */
  private async maybeCleanup(): Promise<void> {
    if (Math.random() > CLEANUP_PROBABILITY) {
      return;
    }

    try {
      const db = getDb();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - TTL_DAYS);

      const result = await db
        .delete(schema.analysisCache)
        .where(lt(schema.analysisCache.createdAt, cutoffDate));

      logger.info('Cache cleanup executed');
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Cache cleanup failed');
    }
  }
}

// Singleton instance
export const analysisCacheService = new AnalysisCacheService();
