import { injectable, inject } from '@crm/shared';
import type { Database } from '@crm/database';
import { runs, type NewRun } from './schema';
import { eq, and, desc } from 'drizzle-orm';

@injectable()
export class RunRepository {
  constructor(@inject('Database') private db: Database) {}

  async create(data: NewRun) {
    const result = await this.db.insert(runs).values(data).returning();
    return result[0];
  }

  async update(
    id: string,
    data: {
      status?: 'running' | 'completed' | 'failed';
      completedAt?: Date;
      itemsProcessed?: number;
      itemsInserted?: number;
      itemsSkipped?: number;
      endToken?: string;
      errorMessage?: string;
      errorStack?: string;
      retryCount?: number;
    }
  ) {
    const result = await this.db.update(runs).set(data).where(eq(runs.id, id)).returning();
    return result[0];
  }

  async findById(id: string) {
    const result = await this.db.select().from(runs).where(eq(runs.id, id)).limit(1);
    return result[0] || null;
  }

  async findByTenant(tenantId: string, options?: { limit?: number }) {
    const limit = options?.limit || 10;

    return this.db
      .select()
      .from(runs)
      .where(eq(runs.tenantId, tenantId))
      .orderBy(desc(runs.startedAt))
      .limit(limit);
  }

  async findByIntegration(integrationId: string, options?: { limit?: number }) {
    const limit = options?.limit || 10;

    return this.db
      .select()
      .from(runs)
      .where(eq(runs.integrationId, integrationId))
      .orderBy(desc(runs.startedAt))
      .limit(limit);
  }

  async findRunningByIntegration(integrationId: string) {
    return this.db
      .select()
      .from(runs)
      .where(and(eq(runs.integrationId, integrationId), eq(runs.status, 'running')))
      .orderBy(desc(runs.startedAt));
  }

  async findRunningByTenant(tenantId: string) {
    return this.db
      .select()
      .from(runs)
      .where(and(eq(runs.tenantId, tenantId), eq(runs.status, 'running')))
      .orderBy(desc(runs.startedAt));
  }
}
