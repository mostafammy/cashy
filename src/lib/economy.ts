import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/client.js';
import { users, transactions } from '../db/schema.js';
import { InsufficientBalanceError } from '../errors.js';

export type TransactionType = 'daily' | 'work' | 'pay' | 'shop_purchase' | 'owner_adjust';

async function ensureUser(tx: Db, userId: string) {
  await tx.insert(users).values({ userId, balance: 0 }).onConflictDoNothing();
}

function assertValidAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Amount must be a positive integer, got: ${amount}`);
  }
}

export async function getBalance(db: Db, userId: string): Promise<number> {
  const [row] = await db.select().from(users).where(eq(users.userId, userId));
  return row?.balance ?? 0;
}

export async function credit(
  db: Db,
  userId: string,
  amount: number,
  type: TransactionType,
  guildId: string | null,
): Promise<void> {
  assertValidAmount(amount);
  await db.transaction(async (tx) => {
    await ensureUser(tx as unknown as Db, userId);
    await tx
      .update(users)
      .set({ balance: sql`${users.balance} + ${amount}` })
      .where(eq(users.userId, userId));
    await tx.insert(transactions).values({
      id: randomUUID(),
      userId,
      amount,
      type,
      guildId,
    });
  });
}

export async function debit(
  db: Db,
  userId: string,
  amount: number,
  type: TransactionType,
  guildId: string | null,
): Promise<void> {
  assertValidAmount(amount);
  await db.transaction(async (tx) => {
    await ensureUser(tx as unknown as Db, userId);
    const [row] = await tx
      .select()
      .from(users)
      .where(eq(users.userId, userId))
      .for('update');

    if (!row || row.balance < amount) {
      throw new InsufficientBalanceError(userId, amount, row?.balance ?? 0);
    }

    await tx
      .update(users)
      .set({ balance: sql`${users.balance} - ${amount}` })
      .where(eq(users.userId, userId));
    await tx.insert(transactions).values({
      id: randomUUID(),
      userId,
      amount: -amount,
      type,
      guildId,
    });
  });
}

export async function transfer(
  db: Db,
  fromUserId: string,
  toUserId: string,
  amount: number,
  guildId: string | null,
): Promise<void> {
  assertValidAmount(amount);
  await db.transaction(async (tx) => {
    await ensureUser(tx as unknown as Db, fromUserId);
    await ensureUser(tx as unknown as Db, toUserId);

    // Lock both rows in a consistent global order (sorted by userId) regardless
    // of sender/recipient role, so two concurrent transfers going opposite
    // directions (A->B and B->A) always acquire locks in the same order and
    // one simply waits for the other instead of deadlocking.
    const [firstId, secondId] = [fromUserId, toUserId].sort();
    const [firstRow] = await tx.select().from(users).where(eq(users.userId, firstId)).for('update');
    const secondRow =
      secondId === firstId
        ? firstRow
        : (await tx.select().from(users).where(eq(users.userId, secondId)).for('update'))[0];

    const sender = firstId === fromUserId ? firstRow : secondRow;

    if (!sender || sender.balance < amount) {
      throw new InsufficientBalanceError(fromUserId, amount, sender?.balance ?? 0);
    }

    await tx
      .update(users)
      .set({ balance: sql`${users.balance} - ${amount}` })
      .where(eq(users.userId, fromUserId));
    await tx
      .update(users)
      .set({ balance: sql`${users.balance} + ${amount}` })
      .where(eq(users.userId, toUserId));

    await tx.insert(transactions).values([
      { id: randomUUID(), userId: fromUserId, counterpartyUserId: toUserId, amount: -amount, type: 'pay', guildId },
      { id: randomUUID(), userId: toUserId, counterpartyUserId: fromUserId, amount, type: 'pay', guildId },
    ]);
  });
}
