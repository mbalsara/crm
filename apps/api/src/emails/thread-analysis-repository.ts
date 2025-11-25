import { injectable, inject } from 'tsyringe';
import type { Database } from '@crm/database';
import type { NewThreadAnalysis, ThreadAnalysis } from './thread-analysis-schema';
import { threadAnalyses } from './thread-analysis-schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../utils/logger';

@injectable()
export class ThreadAnalysisRepository {
  constructor(@inject('Database') private db: Database) {}

  /**
   * Get thread analysis by thread ID and analysis type
   */
  async getByThreadAndType(threadId: string, analysisType: string): Promise<ThreadAnalysis | null> {
    const result = await this.db
      .select()
      .from(threadAnalyses)
      .where(and(eq(threadAnalyses.threadId, threadId), eq(threadAnalyses.analysisType, analysisType)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get all thread analyses for a thread
   */
  async getByThread(threadId: string): Promise<ThreadAnalysis[]> {
    return this.db.select().from(threadAnalyses).where(eq(threadAnalyses.threadId, threadId));
  }

  /**
   * Upsert thread analysis (insert or update)
   */
  async upsert(analysis: NewThreadAnalysis): Promise<ThreadAnalysis> {
    const result = await this.db
      .insert(threadAnalyses)
      .values(analysis)
      .onConflictDoUpdate({
        target: [threadAnalyses.threadId, threadAnalyses.analysisType],
        set: {
          summary: analysis.summary,
          lastAnalyzedEmailId: analysis.lastAnalyzedEmailId,
          lastAnalyzedAt: analysis.lastAnalyzedAt,
          modelUsed: analysis.modelUsed,
          summaryVersion: analysis.summaryVersion,
          promptTokens: analysis.promptTokens,
          completionTokens: analysis.completionTokens,
          totalTokens: analysis.totalTokens,
          metadata: analysis.metadata,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  }

  /**
   * Delete thread analysis
   */
  async delete(threadId: string, analysisType: string): Promise<void> {
    await this.db
      .delete(threadAnalyses)
      .where(and(eq(threadAnalyses.threadId, threadId), eq(threadAnalyses.analysisType, analysisType)));
  }

  /**
   * Delete all analyses for a thread
   */
  async deleteByThread(threadId: string): Promise<void> {
    await this.db.delete(threadAnalyses).where(eq(threadAnalyses.threadId, threadId));
  }
}
