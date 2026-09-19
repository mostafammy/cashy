import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { createRedis } from '../../src/redis/client.js';
import { users, transactions } from '../../src/db/schema.js';
import { transfer } from '../../src/lib/economy.js';
import { inArray } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { requireEnv } from '../helpers/env.js';

const db = createDb(requireEnv('DATABASE_URL'));
const redis = createRedis(requireEnv('REDIS_URL'));

describe('transfer concurrency', () => {
  afterAll(() => redis.quit());

  beforeEach(async () => {
    await db.delete(transactions).where(inArray(transactions.userId, ['race-a', 'race-b']));
    await db.delete(users).where(inArray(users.userId, ['race-a', 'race-b']));
    await db.insert(users).values([
      { userId: 'race-a', balance: 100 },
      { userId: 'race-b', balance: 0 },
    ]);
  });

  it('never lets balance go negative under concurrent transfers of the same funds', async () => {
    const results = await Promise.allSettled([
      transfer(db, redis, 'race-a', 'race-b', 80, null),
      transfer(db, redis, 'race-a', 'race-b', 80, null),
    ]);

    const [{ balance: senderBalance }] = await db.select().from(users).where(eq(users.userId, 'race-a'));
    expect(senderBalance).toBeGreaterThanOrEqual(0);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });
});
