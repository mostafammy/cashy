import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { users, transactions } from '../../src/db/schema.js';
import { getBalance, credit, debit, transfer } from '../../src/lib/economy.js';
import { InsufficientBalanceError } from '../../src/errors.js';
import { eq } from 'drizzle-orm';

const db = createDb(process.env.DATABASE_URL ?? 'postgres://cashy:cashy@localhost:5432/cashy');

async function resetUser(userId: string, balance: number) {
  await db.delete(transactions).where(eq(transactions.userId, userId));
  await db.delete(users).where(eq(users.userId, userId));
  await db.insert(users).values({ userId, balance });
}

describe('economy lib', () => {
  beforeEach(async () => {
    await resetUser('econ-a', 100);
    await resetUser('econ-b', 0);
  });

  it('credit increases balance and logs a transaction', async () => {
    await credit(db, 'econ-a', 50, 'daily', null);
    expect(await getBalance(db, 'econ-a')).toBe(150);
    const [tx] = await db.select().from(transactions).where(eq(transactions.userId, 'econ-a'));
    expect(tx.amount).toBe(50);
    expect(tx.type).toBe('daily');
  });

  it('debit decreases balance', async () => {
    await debit(db, 'econ-a', 30, 'shop_purchase', 'guild-1');
    expect(await getBalance(db, 'econ-a')).toBe(70);
  });

  it('debit throws InsufficientBalanceError and leaves balance unchanged', async () => {
    await expect(debit(db, 'econ-a', 1000, 'shop_purchase', null)).rejects.toThrow(InsufficientBalanceError);
    expect(await getBalance(db, 'econ-a')).toBe(100);
  });

  it('transfer moves balance from sender to recipient atomically', async () => {
    await transfer(db, 'econ-a', 'econ-b', 40, 'guild-1');
    expect(await getBalance(db, 'econ-a')).toBe(60);
    expect(await getBalance(db, 'econ-b')).toBe(40);
  });

  it('transfer throws InsufficientBalanceError when sender cannot cover it', async () => {
    await expect(transfer(db, 'econ-a', 'econ-b', 500, null)).rejects.toThrow(InsufficientBalanceError);
    expect(await getBalance(db, 'econ-a')).toBe(100);
    expect(await getBalance(db, 'econ-b')).toBe(0);
  });
});
