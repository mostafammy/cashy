import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { createRedis } from '../../src/redis/client.js';
import { users, transactions } from '../../src/db/schema.js';
import { getBalance, credit, debit, transfer } from '../../src/lib/economy.js';
import { InsufficientBalanceError } from '../../src/errors.js';
import { eq } from 'drizzle-orm';
import { requireEnv } from '../helpers/env.js';

const db = createDb(requireEnv('DATABASE_URL'));
const redis = createRedis(requireEnv('REDIS_URL'));

async function resetUser(userId: string, balance: number) {
  await db.delete(transactions).where(eq(transactions.userId, userId));
  await db.delete(users).where(eq(users.userId, userId));
  await db.insert(users).values({ userId, balance });
}

describe('economy lib', () => {
  afterAll(() => redis.quit());

  beforeEach(async () => {
    await resetUser('econ-a', 100);
    await resetUser('econ-b', 0);
  });

  it('credit increases balance and logs a transaction', async () => {
    await credit(db, redis, 'econ-a', 50, 'daily', null);
    expect(await getBalance(db, 'econ-a')).toBe(150);
    const [tx] = await db.select().from(transactions).where(eq(transactions.userId, 'econ-a'));
    expect(tx.amount).toBe(50);
    expect(tx.type).toBe('daily');
  });

  it('debit decreases balance', async () => {
    await debit(db, redis, 'econ-a', 30, 'shop_purchase', 'guild-1');
    expect(await getBalance(db, 'econ-a')).toBe(70);
  });

  it('debit throws InsufficientBalanceError and leaves balance unchanged', async () => {
    await expect(debit(db, redis, 'econ-a', 1000, 'shop_purchase', null)).rejects.toThrow(InsufficientBalanceError);
    expect(await getBalance(db, 'econ-a')).toBe(100);
  });

  it('transfer moves balance from sender to recipient atomically', async () => {
    await transfer(db, redis, 'econ-a', 'econ-b', 40, 'guild-1');
    expect(await getBalance(db, 'econ-a')).toBe(60);
    expect(await getBalance(db, 'econ-b')).toBe(40);
  });

  it('transfer throws InsufficientBalanceError when sender cannot cover it', async () => {
    await expect(transfer(db, redis, 'econ-a', 'econ-b', 500, null)).rejects.toThrow(InsufficientBalanceError);
    expect(await getBalance(db, 'econ-a')).toBe(100);
    expect(await getBalance(db, 'econ-b')).toBe(0);
  });

  it('credit rejects a zero, negative, or non-integer amount and leaves balance unchanged', async () => {
    await expect(credit(db, redis, 'econ-a', -5, 'daily', null)).rejects.toThrow(/positive integer/);
    await expect(credit(db, redis, 'econ-a', 0, 'daily', null)).rejects.toThrow(/positive integer/);
    await expect(credit(db, redis, 'econ-a', 1.5, 'daily', null)).rejects.toThrow(/positive integer/);
    expect(await getBalance(db, 'econ-a')).toBe(100);
  });

  it('debit rejects a zero, negative, or non-integer amount and leaves balance unchanged', async () => {
    await expect(debit(db, redis, 'econ-a', -5, 'shop_purchase', null)).rejects.toThrow(/positive integer/);
    await expect(debit(db, redis, 'econ-a', 0, 'shop_purchase', null)).rejects.toThrow(/positive integer/);
    await expect(debit(db, redis, 'econ-a', 1.5, 'shop_purchase', null)).rejects.toThrow(/positive integer/);
    expect(await getBalance(db, 'econ-a')).toBe(100);
  });

  it('transfer rejects a zero, negative, or non-integer amount and leaves balances unchanged', async () => {
    await expect(transfer(db, redis, 'econ-a', 'econ-b', -5, null)).rejects.toThrow(/positive integer/);
    await expect(transfer(db, redis, 'econ-a', 'econ-b', 0, null)).rejects.toThrow(/positive integer/);
    await expect(transfer(db, redis, 'econ-a', 'econ-b', 1.5, null)).rejects.toThrow(/positive integer/);
    expect(await getBalance(db, 'econ-a')).toBe(100);
    expect(await getBalance(db, 'econ-b')).toBe(0);
  });

  it('concurrent opposite-direction transfers (A->B and B->A) both complete with correct final balances', async () => {
    // econ-a starts at 100, econ-b at 0. Fire a 30 transfer A->B and a 10
    // transfer B->A concurrently. Regardless of ordering, neither should
    // deadlock or error, and the net effect should be deterministic:
    // econ-a: 100 - 30 + 10 = 80, econ-b: 0 + 30 - 10 = 20.
    // B->A can only succeed once B has received funds from A, so drizzle/pg's
    // row locking must serialize these two transactions rather than deadlock.
    await credit(db, redis, 'econ-b', 10, 'owner_adjust', null); // give econ-b enough to send back
    await Promise.all([
      transfer(db, redis, 'econ-a', 'econ-b', 30, null),
      transfer(db, redis, 'econ-b', 'econ-a', 10, null),
    ]);
    expect(await getBalance(db, 'econ-a')).toBe(80);
    expect(await getBalance(db, 'econ-b')).toBe(30);
  });
});
