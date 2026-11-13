import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';

/** اتصال واحد به Postgres؛ همهٔ ماژول‌ها از همین می‌خوانند و می‌نویسند. */
@Injectable()
export class Db implements OnModuleDestroy {
  readonly pool: Pool;
  constructor() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX || 10) });
  }
  async q<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.pool.query<T>(sql, params as any[]);
    return r.rows;
  }
  async one<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.q<T>(sql, params);
    return rows[0] ?? null;
  }
  /** چند دستور در یک تراکنش؛ هر خطا همه را برمی‌گرداند */
  async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      const out = await fn(c);
      await c.query('commit');
      return out;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  }
  async onModuleDestroy() { await this.pool.end(); }
}
