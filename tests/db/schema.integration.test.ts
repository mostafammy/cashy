import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { users } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { requireEnv } from '../helpers/env.js';

const db = createDb(requireEnv('DATABASE_URL'));

describe('users table', () => {
  afterAll(async () => {
    await db.delete(users).where(eq(users.userId, 'test-user-1'));
  });

  it('inserts and reads back a user row', async () => {
    await db.insert(users).values({ userId: 'test-user-1', balance: 500 });
    const [row] = await db.select().from(users).where(eq(users.userId, 'test-user-1'));
    expect(row.balance).toBe(500);
  });
});
