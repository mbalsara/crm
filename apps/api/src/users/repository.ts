import { eq } from 'drizzle-orm';
import { injectable, inject } from '@crm/shared';
import type { Database } from '@crm/database';
import { users, type User, type NewUser } from './schema';

@injectable()
export class UserRepository {
  constructor(@inject('Database') private db: Database) {}

  async findAll(): Promise<User[]> {
    return this.db.select().from(users);
  }

  async findById(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async create(data: NewUser): Promise<User> {
    const result = await this.db.insert(users).values(data).returning();
    return result[0];
  }

  async update(id: string, data: Partial<NewUser>): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }
}
