# Cashy v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build v1 of Cashy — a Discord bot with a single universal currency wallet per Discord user, usable across every server the bot is installed in.

**Architecture:** A single Node.js/TypeScript process running discord.js (behind a `ShardingManager` entry point), backed by PostgreSQL (Drizzle ORM) for durable state and Redis for cooldowns/leaderboard caching. All balance mutations flow through one transactional library module so there is exactly one code path that can create, destroy, or move currency.

**Tech Stack:** TypeScript, Node.js 20+, discord.js v14, Drizzle ORM + `postgres` (postgres.js) driver, PostgreSQL (Neon in prod, Docker locally), Redis (Upstash in prod, Docker locally) via `ioredis`, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-09-19-cashy-universal-currency-design.md`

## Global Constraints

- Currency identity (name, symbol, daily amount, work amount range) lives only in the single-row `bot_config` table — never per-guild.
- Minting or adjusting a balance out of thin air is gated by membership in the `OWNER_IDS` env var, checked in application code — never by a Discord role/permission.
- Every balance-affecting operation (credit, debit, transfer) must go through `src/lib/economy.ts` — no command computes balance changes itself.
- `/daily` and `/work` cooldowns are keyed by `user_id` only (no guild segment) and stored in Redis so a bot restart never resets them.
- Shop items (`shop_items`) are scoped by `guild_id`; balances (`users`) are never scoped by guild.
- Language/runtime: TypeScript on Node.js 20+, discord.js v14.
- Database: PostgreSQL via Drizzle ORM. Cache: Redis via `ioredis`.

---

## File Structure

```
src/
  env.ts                        - typed env var loading/validation
  db/
    schema.ts                   - Drizzle table definitions
    client.ts                   - Drizzle + postgres.js connection
  redis/
    client.ts                   - ioredis connection
  lib/
    economy.ts                  - credit/debit/transfer (transactional)
    cooldowns.ts                - Redis-backed daily/work cooldowns
    config.ts                   - bot_config read/write + Redis cache
    permissions.ts              - OWNER_IDS check
    leaderboard.ts              - guild/global leaderboard queries + cache
  commands/
    types.ts                    - Command interface
    registry.ts                 - command map + interaction routing
    economy/balance.ts
    economy/daily.ts
    economy/work.ts
    economy/pay.ts
    economy/leaderboard.ts
    shop/view.ts
    shop/buy.ts
    shop/admin.ts                - /shop add, /shop remove (guild-admin)
    owner/owner.ts                - /owner mint, adjust-balance, set-config
  events/
    guildMember.ts                - guildMemberAdd/Remove -> guild_members sync
  errors.ts                       - typed errors + central interaction error handler
  bot.ts                          - discord.js Client bootstrap, single shard
  shard.ts                        - ShardingManager entry point (process entry)
scripts/
  deploy-commands.ts              - registers slash commands with Discord REST API
tests/
  lib/economy.test.ts
  lib/cooldowns.test.ts
  lib/config.test.ts
  lib/permissions.test.ts
  lib/leaderboard.test.ts
  commands/economy.test.ts
  integration/pay.integration.test.ts
drizzle/                          - generated SQL migrations (drizzle-kit output)
docker-compose.yml                - local Postgres + Redis for dev/tests
Dockerfile
fly.toml
.env.example
drizzle.config.ts
vitest.config.ts
tsconfig.json
package.json
```

---

## Task 1: Project scaffolding and env config

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore` (already exists, verify entries)
- Create: `src/env.ts`
- Test: `tests/env.test.ts`

**Interfaces:**
- Produces: `export interface Env { discordToken: string; databaseUrl: string; redisUrl: string; ownerIds: string[] }` and `export function loadEnv(source: NodeJS.ProcessEnv): Env` (throws `Error` with a descriptive message if a required var is missing).

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "cashy",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/shard.js",
    "dev": "tsx src/shard.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "deploy-commands": "tsx scripts/deploy-commands.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "discord.js": "^14.16.3",
    "drizzle-orm": "^0.33.0",
    "postgres": "^3.4.4",
    "ioredis": "^5.4.1",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "tsx": "^4.19.0",
    "vitest": "^2.1.1",
    "drizzle-kit": "^0.24.2",
    "@types/node": "^20.14.15"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "scripts"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write `.env.example`**

```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DATABASE_URL=postgres://cashy:cashy@localhost:5432/cashy
REDIS_URL=redis://localhost:6379
OWNER_IDS=123456789012345678
```

- [ ] **Step 5: Verify `.gitignore` covers `node_modules/`, `dist/`, `.env`**

Run: `grep -E "node_modules|dist|\.env" .gitignore`
Expected: all three patterns present (they already are from the earlier scaffolding commit — no edit needed if so).

- [ ] **Step 6: Write the failing test for `loadEnv`**

```typescript
// tests/env.test.ts
import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/env.js';

describe('loadEnv', () => {
  it('parses required vars and splits OWNER_IDS on commas', () => {
    const env = loadEnv({
      DISCORD_TOKEN: 'token123',
      DATABASE_URL: 'postgres://x',
      REDIS_URL: 'redis://x',
      OWNER_IDS: '111,222 ,333',
    } as NodeJS.ProcessEnv);

    expect(env).toEqual({
      discordToken: 'token123',
      databaseUrl: 'postgres://x',
      redisUrl: 'redis://x',
      ownerIds: ['111', '222', '333'],
    });
  });

  it('throws when a required var is missing', () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow(/DISCORD_TOKEN/);
  });
});
```

- [ ] **Step 7: Install dependencies and run the test to verify it fails**

Run: `npm install && npx vitest run tests/env.test.ts`
Expected: FAIL with "Cannot find module '../src/env.js'" or similar.

- [ ] **Step 8: Implement `src/env.ts`**

```typescript
export interface Env {
  discordToken: string;
  databaseUrl: string;
  redisUrl: string;
  ownerIds: string[];
}

const REQUIRED = ['DISCORD_TOKEN', 'DATABASE_URL', 'REDIS_URL', 'OWNER_IDS'] as const;

export function loadEnv(source: NodeJS.ProcessEnv): Env {
  for (const key of REQUIRED) {
    if (!source[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    discordToken: source.DISCORD_TOKEN!,
    databaseUrl: source.DATABASE_URL!,
    redisUrl: source.REDIS_URL!,
    ownerIds: source.OWNER_IDS!.split(',').map((id) => id.trim()).filter(Boolean),
  };
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run tests/env.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .env.example src/env.ts tests/env.test.ts package-lock.json
git commit -m "chore: project scaffolding and typed env config"
```

---

## Task 2: Database schema and local Postgres

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `drizzle.config.ts`, `docker-compose.yml`
- Test: `tests/db/schema.integration.test.ts`

**Interfaces:**
- Consumes: `Env` from `src/env.ts` (`databaseUrl`).
- Produces: Drizzle tables `users`, `transactions`, `shopItems`, `botConfig`, `guildConfig`, `guildMembers` (exported from `src/db/schema.ts`), and `export function createDb(databaseUrl: string)` returning a Drizzle instance, from `src/db/client.ts`.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: cashy
      POSTGRES_PASSWORD: cashy
      POSTGRES_DB: cashy
    ports:
      - "5432:5432"
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

- [ ] **Step 2: Write `src/db/schema.ts`**

```typescript
import { pgTable, text, integer, bigint, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  userId: text('user_id').primaryKey(),
  balance: bigint('balance', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  counterpartyUserId: text('counterparty_user_id'),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  type: text('type').$type<'daily' | 'work' | 'pay' | 'shop_purchase' | 'owner_adjust'>().notNull(),
  guildId: text('guild_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const shopItems = pgTable('shop_items', {
  id: text('id').primaryKey(),
  guildId: text('guild_id').notNull(),
  name: text('name').notNull(),
  price: bigint('price', { mode: 'number' }).notNull(),
  roleId: text('role_id').notNull(),
  description: text('description'),
});

export const botConfig = pgTable('bot_config', {
  id: integer('id').primaryKey().default(1),
  currencyName: text('currency_name').notNull().default('Coins'),
  currencySymbol: text('currency_symbol').notNull().default('🪙'),
  dailyAmount: bigint('daily_amount', { mode: 'number' }).notNull().default(100),
  workMin: bigint('work_min', { mode: 'number' }).notNull().default(20),
  workMax: bigint('work_max', { mode: 'number' }).notNull().default(80),
});

export const guildConfig = pgTable('guild_config', {
  guildId: text('guild_id').primaryKey(),
  shopChannelId: text('shop_channel_id'),
});

export const guildMembers = pgTable('guild_members', {
  guildId: text('guild_id').notNull(),
  userId: text('user_id').notNull(),
  inGuild: boolean('in_guild').notNull().default(true),
});
```

- [ ] **Step 3: Write `drizzle.config.ts`**

```typescript
import 'dotenv/config';
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
```

- [ ] **Step 4: Write `src/db/client.ts`**

```typescript
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl);
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
```

- [ ] **Step 5: Write `src/db/migrate.ts`**

```typescript
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);

await migrate(db, { migrationsFolder: './drizzle' });
await client.end();
console.log('Migrations applied.');
```

- [ ] **Step 6: Start local Postgres, generate, and apply the migration**

Run: `docker compose up -d postgres && npx drizzle-kit generate && npx tsx src/db/migrate.ts`
Expected: a new SQL file appears under `drizzle/`, and the script prints `Migrations applied.`

- [ ] **Step 7: Write the integration test proving the schema round-trips**

```typescript
// tests/db/schema.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { users } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

const db = createDb(process.env.DATABASE_URL ?? 'postgres://cashy:cashy@localhost:5432/cashy');

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
```

- [ ] **Step 8: Run the integration test to verify it passes**

Run: `npx vitest run tests/db/schema.integration.test.ts`
Expected: PASS (requires `docker compose up -d postgres` and migrations already applied from Step 6)

- [ ] **Step 9: Commit**

```bash
git add src/db docker-compose.yml drizzle.config.ts drizzle tests/db
git commit -m "feat: Drizzle schema, migrations, and local Postgres setup"
```

---

## Task 3: Redis client

**Files:**
- Create: `src/redis/client.ts`
- Test: `tests/redis/client.integration.test.ts`

**Interfaces:**
- Produces: `export function createRedis(redisUrl: string): Redis` from `src/redis/client.ts` (re-exports `ioredis`'s `Redis` type).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/redis/client.integration.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { createRedis } from '../../src/redis/client.js';

const redis = createRedis(process.env.REDIS_URL ?? 'redis://localhost:6379');

describe('createRedis', () => {
  afterAll(() => redis.quit());

  it('connects and can set/get a key', async () => {
    await redis.set('cashy:test:ping', 'pong');
    const value = await redis.get('cashy:test:ping');
    expect(value).toBe('pong');
    await redis.del('cashy:test:ping');
  });
});
```

- [ ] **Step 2: Start local Redis and run the test to verify it fails**

Run: `docker compose up -d redis && npx vitest run tests/redis/client.integration.test.ts`
Expected: FAIL with "Cannot find module '../../src/redis/client.js'"

- [ ] **Step 3: Implement `src/redis/client.ts`**

```typescript
import Redis from 'ioredis';

export function createRedis(redisUrl: string): Redis {
  return new Redis(redisUrl);
}

export type { Redis };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/redis/client.integration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/redis tests/redis
git commit -m "feat: Redis client setup"
```

---

## Task 4: Economy library (credit/debit/transfer)

**Files:**
- Create: `src/errors.ts`, `src/lib/economy.ts`
- Test: `tests/lib/economy.test.ts`

**Interfaces:**
- Consumes: `Db` type from `src/db/client.ts`; `users`, `transactions` from `src/db/schema.ts`.
- Produces:
  - `export class InsufficientBalanceError extends Error {}` (in `src/errors.ts`)
  - `export async function getBalance(db: Db, userId: string): Promise<number>`
  - `export async function credit(db: Db, userId: string, amount: number, type: TransactionType, guildId: string | null): Promise<void>`
  - `export async function debit(db: Db, userId: string, amount: number, type: TransactionType, guildId: string | null): Promise<void>` — throws `InsufficientBalanceError` if balance would go negative
  - `export async function transfer(db: Db, fromUserId: string, toUserId: string, amount: number, guildId: string | null): Promise<void>`
  - `export type TransactionType = 'daily' | 'work' | 'pay' | 'shop_purchase' | 'owner_adjust'`
  (all in `src/lib/economy.ts`)

- [ ] **Step 1: Write `src/errors.ts`**

```typescript
export class InsufficientBalanceError extends Error {
  constructor(userId: string, requested: number, available: number) {
    super(`User ${userId} has ${available} but requested ${requested}`);
    this.name = 'InsufficientBalanceError';
  }
}

export class OnCooldownError extends Error {
  constructor(public readonly remainingSeconds: number) {
    super(`On cooldown for ${remainingSeconds}s`);
    this.name = 'OnCooldownError';
  }
}
```

- [ ] **Step 2: Write the failing tests for `economy.ts`**

```typescript
// tests/lib/economy.test.ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/economy.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/economy.js'"

- [ ] **Step 4: Implement `src/lib/economy.ts`**

```typescript
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/client.js';
import { users, transactions } from '../db/schema.js';
import { InsufficientBalanceError } from '../errors.js';

export type TransactionType = 'daily' | 'work' | 'pay' | 'shop_purchase' | 'owner_adjust';

async function ensureUser(tx: Db, userId: string) {
  await tx.insert(users).values({ userId, balance: 0 }).onConflictDoNothing();
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
  await db.transaction(async (tx) => {
    await ensureUser(tx as unknown as Db, fromUserId);
    await ensureUser(tx as unknown as Db, toUserId);

    const [sender] = await tx
      .select()
      .from(users)
      .where(eq(users.userId, fromUserId))
      .for('update');

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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/economy.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/errors.ts src/lib/economy.ts tests/lib/economy.test.ts
git commit -m "feat: transactional economy library (credit/debit/transfer)"
```

---

## Task 5: Cooldowns library

**Files:**
- Create: `src/lib/cooldowns.ts`
- Test: `tests/lib/cooldowns.test.ts`

**Interfaces:**
- Consumes: `Redis` type from `src/redis/client.ts`.
- Produces:
  - `export async function getCooldownRemaining(redis: Redis, kind: 'daily' | 'work', userId: string): Promise<number>` — seconds remaining, `0` if not on cooldown
  - `export async function setCooldown(redis: Redis, kind: 'daily' | 'work', userId: string, ttlSeconds: number): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/cooldowns.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { createRedis } from '../../src/redis/client.js';
import { getCooldownRemaining, setCooldown } from '../../src/lib/cooldowns.js';

const redis = createRedis(process.env.REDIS_URL ?? 'redis://localhost:6379');

describe('cooldowns lib', () => {
  afterEach(async () => {
    await redis.del('cashy:cooldown:daily:user-1');
  });

  it('returns 0 when no cooldown is set', async () => {
    expect(await getCooldownRemaining(redis, 'daily', 'user-1')).toBe(0);
  });

  it('returns a positive remaining time after setCooldown', async () => {
    await setCooldown(redis, 'daily', 'user-1', 60);
    const remaining = await getCooldownRemaining(redis, 'daily', 'user-1');
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(60);
  });

  it('cooldown key has no guild segment (global per user)', async () => {
    await setCooldown(redis, 'work', 'user-1', 30);
    const keys = await redis.keys('cashy:cooldown:work:user-1');
    expect(keys).toEqual(['cashy:cooldown:work:user-1']);
    await redis.del('cashy:cooldown:work:user-1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/cooldowns.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/cooldowns.js'"

- [ ] **Step 3: Implement `src/lib/cooldowns.ts`**

```typescript
import type { Redis } from '../redis/client.js';

function key(kind: 'daily' | 'work', userId: string): string {
  return `cashy:cooldown:${kind}:${userId}`;
}

export async function getCooldownRemaining(redis: Redis, kind: 'daily' | 'work', userId: string): Promise<number> {
  const ttl = await redis.ttl(key(kind, userId));
  return ttl > 0 ? ttl : 0;
}

export async function setCooldown(redis: Redis, kind: 'daily' | 'work', userId: string, ttlSeconds: number): Promise<void> {
  await redis.set(key(kind, userId), '1', 'EX', ttlSeconds);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/cooldowns.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/cooldowns.ts tests/lib/cooldowns.test.ts
git commit -m "feat: Redis-backed global cooldowns for daily/work"
```

---

## Task 6: Bot config library (currency identity)

**Files:**
- Create: `src/lib/config.ts`
- Test: `tests/lib/config.test.ts`

**Interfaces:**
- Consumes: `Db` from `src/db/client.ts`, `Redis` from `src/redis/client.ts`, `botConfig` table from `src/db/schema.ts`.
- Produces:
  - `export interface BotConfig { currencyName: string; currencySymbol: string; dailyAmount: number; workMin: number; workMax: number }`
  - `export async function getBotConfig(db: Db, redis: Redis): Promise<BotConfig>` (cached in Redis, 60s TTL)
  - `export async function setBotConfig(db: Db, redis: Redis, patch: Partial<BotConfig>): Promise<BotConfig>` (writes DB, invalidates cache)

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/config.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { createRedis } from '../../src/redis/client.js';
import { botConfig } from '../../src/db/schema.js';
import { getBotConfig, setBotConfig } from '../../src/lib/config.js';

const db = createDb(process.env.DATABASE_URL ?? 'postgres://cashy:cashy@localhost:5432/cashy');
const redis = createRedis(process.env.REDIS_URL ?? 'redis://localhost:6379');

describe('bot config lib', () => {
  beforeEach(async () => {
    await db.delete(botConfig);
    await redis.del('cashy:bot_config');
  });

  afterAll(() => redis.quit());

  it('returns defaults when no row exists yet', async () => {
    const config = await getBotConfig(db, redis);
    expect(config.currencyName).toBe('Coins');
    expect(config.dailyAmount).toBe(100);
  });

  it('setBotConfig persists changes and getBotConfig reflects them', async () => {
    await setBotConfig(db, redis, { currencyName: 'Shells', dailyAmount: 200 });
    await redis.del('cashy:bot_config');
    const config = await getBotConfig(db, redis);
    expect(config.currencyName).toBe('Shells');
    expect(config.dailyAmount).toBe(200);
  });

  it('getBotConfig serves from cache without hitting the DB on the second call', async () => {
    await getBotConfig(db, redis);
    await db.delete(botConfig);
    const config = await getBotConfig(db, redis);
    expect(config.currencyName).toBe('Coins');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/config.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/config.js'"

- [ ] **Step 3: Implement `src/lib/config.ts`**

```typescript
import type { Db } from '../db/client.js';
import type { Redis } from '../redis/client.js';
import { botConfig } from '../db/schema.js';

export interface BotConfig {
  currencyName: string;
  currencySymbol: string;
  dailyAmount: number;
  workMin: number;
  workMax: number;
}

const CACHE_KEY = 'cashy:bot_config';
const CACHE_TTL_SECONDS = 60;

const DEFAULTS: BotConfig = {
  currencyName: 'Coins',
  currencySymbol: '🪙',
  dailyAmount: 100,
  workMin: 20,
  workMax: 80,
};

export async function getBotConfig(db: Db, redis: Redis): Promise<BotConfig> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as BotConfig;

  const [row] = await db.select().from(botConfig);
  const config: BotConfig = row
    ? {
        currencyName: row.currencyName,
        currencySymbol: row.currencySymbol,
        dailyAmount: row.dailyAmount,
        workMin: row.workMin,
        workMax: row.workMax,
      }
    : DEFAULTS;

  await redis.set(CACHE_KEY, JSON.stringify(config), 'EX', CACHE_TTL_SECONDS);
  return config;
}

export async function setBotConfig(db: Db, redis: Redis, patch: Partial<BotConfig>): Promise<BotConfig> {
  const current = await getBotConfig(db, redis);
  const next = { ...current, ...patch };

  await db
    .insert(botConfig)
    .values({ id: 1, ...next })
    .onConflictDoUpdate({ target: botConfig.id, set: next });

  await redis.del(CACHE_KEY);
  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/config.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts tests/lib/config.test.ts
git commit -m "feat: cached bot_config library for global currency identity"
```

---

## Task 7: Owner permissions library

**Files:**
- Create: `src/lib/permissions.ts`
- Test: `tests/lib/permissions.test.ts`

**Interfaces:**
- Produces: `export function isOwner(ownerIds: string[], userId: string): boolean`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/permissions.test.ts
import { describe, it, expect } from 'vitest';
import { isOwner } from '../../src/lib/permissions.js';

describe('isOwner', () => {
  it('returns true when userId is in ownerIds', () => {
    expect(isOwner(['111', '222'], '222')).toBe(true);
  });

  it('returns false when userId is not in ownerIds', () => {
    expect(isOwner(['111', '222'], '333')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/permissions.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/permissions.js'"

- [ ] **Step 3: Implement `src/lib/permissions.ts`**

```typescript
export function isOwner(ownerIds: string[], userId: string): boolean {
  return ownerIds.includes(userId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/permissions.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions.ts tests/lib/permissions.test.ts
git commit -m "feat: owner permission check gated by OWNER_IDS env var"
```

---

## Task 8: Leaderboard library

**Files:**
- Create: `src/lib/leaderboard.ts`
- Test: `tests/lib/leaderboard.test.ts`

**Interfaces:**
- Consumes: `Db`, `Redis`, `users` and `guildMembers` tables.
- Produces:
  - `export interface LeaderboardEntry { userId: string; balance: number }`
  - `export async function getGuildLeaderboard(db: Db, redis: Redis, guildId: string, limit?: number): Promise<LeaderboardEntry[]>` (default `limit = 10`, cached 30s in Redis, filtered to `guildMembers` rows with `inGuild = true`)
  - `export async function getGlobalLeaderboard(db: Db, redis: Redis, limit?: number): Promise<LeaderboardEntry[]>` (no guild filter)
  - `export async function invalidateLeaderboardCache(redis: Redis, guildId?: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/leaderboard.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { createRedis } from '../../src/redis/client.js';
import { users, guildMembers } from '../../src/db/schema.js';
import { getGuildLeaderboard, getGlobalLeaderboard, invalidateLeaderboardCache } from '../../src/lib/leaderboard.js';
import { inArray } from 'drizzle-orm';

const db = createDb(process.env.DATABASE_URL ?? 'postgres://cashy:cashy@localhost:5432/cashy');
const redis = createRedis(process.env.REDIS_URL ?? 'redis://localhost:6379');

describe('leaderboard lib', () => {
  beforeEach(async () => {
    await db.delete(guildMembers).where(inArray(guildMembers.userId, ['lb-a', 'lb-b', 'lb-c']));
    await db.delete(users).where(inArray(users.userId, ['lb-a', 'lb-b', 'lb-c']));
    await db.insert(users).values([
      { userId: 'lb-a', balance: 300 },
      { userId: 'lb-b', balance: 100 },
      { userId: 'lb-c', balance: 200 },
    ]);
    await db.insert(guildMembers).values([
      { guildId: 'guild-x', userId: 'lb-a', inGuild: true },
      { guildId: 'guild-x', userId: 'lb-c', inGuild: true },
    ]);
    await invalidateLeaderboardCache(redis, 'guild-x');
    await invalidateLeaderboardCache(redis);
  });

  afterAll(() => redis.quit());

  it('getGuildLeaderboard only includes members of that guild, sorted descending', async () => {
    const board = await getGuildLeaderboard(db, redis, 'guild-x');
    expect(board.map((e) => e.userId)).toEqual(['lb-a', 'lb-c']);
  });

  it('getGlobalLeaderboard includes everyone, sorted descending', async () => {
    const board = await getGlobalLeaderboard(db, redis);
    expect(board.slice(0, 3).map((e) => e.userId)).toEqual(
      expect.arrayContaining(['lb-a', 'lb-b', 'lb-c']),
    );
    expect(board[0].userId).toBe('lb-a');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/leaderboard.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/leaderboard.js'"

- [ ] **Step 3: Implement `src/lib/leaderboard.ts`**

```typescript
import { desc, eq, and, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { Redis } from '../redis/client.js';
import { users, guildMembers } from '../db/schema.js';

export interface LeaderboardEntry {
  userId: string;
  balance: number;
}

const CACHE_TTL_SECONDS = 30;

function cacheKey(guildId?: string): string {
  return guildId ? `cashy:leaderboard:${guildId}` : 'cashy:leaderboard:global';
}

export async function getGuildLeaderboard(
  db: Db,
  redis: Redis,
  guildId: string,
  limit = 10,
): Promise<LeaderboardEntry[]> {
  const cached = await redis.get(cacheKey(guildId));
  if (cached) return JSON.parse(cached) as LeaderboardEntry[];

  const members = await db
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.inGuild, true)));
  const memberIds = members.map((m) => m.userId);

  const rows = memberIds.length
    ? await db
        .select({ userId: users.userId, balance: users.balance })
        .from(users)
        .where(inArray(users.userId, memberIds))
        .orderBy(desc(users.balance))
        .limit(limit)
    : [];

  await redis.set(cacheKey(guildId), JSON.stringify(rows), 'EX', CACHE_TTL_SECONDS);
  return rows;
}

export async function getGlobalLeaderboard(db: Db, redis: Redis, limit = 10): Promise<LeaderboardEntry[]> {
  const cached = await redis.get(cacheKey());
  if (cached) return JSON.parse(cached) as LeaderboardEntry[];

  const rows = await db
    .select({ userId: users.userId, balance: users.balance })
    .from(users)
    .orderBy(desc(users.balance))
    .limit(limit);

  await redis.set(cacheKey(), JSON.stringify(rows), 'EX', CACHE_TTL_SECONDS);
  return rows;
}

export async function invalidateLeaderboardCache(redis: Redis, guildId?: string): Promise<void> {
  await redis.del(cacheKey(guildId));
  if (!guildId) return;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/leaderboard.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts tests/lib/leaderboard.test.ts
git commit -m "feat: guild and global leaderboard queries with Redis caching"
```

---

## Task 9: Command registry and central error handler

**Files:**
- Create: `src/commands/types.ts`, `src/commands/registry.ts`
- Modify: `src/errors.ts` (add `handleCommandError`)
- Test: `tests/commands/registry.test.ts`

**Interfaces:**
- Consumes: `InsufficientBalanceError`, `OnCooldownError` from `src/errors.ts`.
- Produces:
  - `export interface Command { data: { name: string; toJSON: () => unknown }; execute: (interaction: ChatInputCommandInteraction) => Promise<void> }` (`src/commands/types.ts`)
  - `export function createRegistry(): { register: (cmd: Command) => void; get: (name: string) => Command | undefined; handleInteraction: (interaction: ChatInputCommandInteraction) => Promise<void> }` (`src/commands/registry.ts`)
  - `export async function handleCommandError(interaction: ChatInputCommandInteraction, error: unknown): Promise<void>` (`src/errors.ts`)

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/commands/registry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createRegistry } from '../../src/commands/registry.js';
import { InsufficientBalanceError, OnCooldownError } from '../../src/errors.js';
import type { Command } from '../../src/commands/types.js';
import type { ChatInputCommandInteraction } from 'discord.js';

function mockInteraction(commandName: string) {
  return {
    commandName,
    replied: false,
    deferred: false,
    reply: vi.fn(),
  } as unknown as ChatInputCommandInteraction;
}

describe('command registry', () => {
  it('routes an interaction to the matching command execute()', async () => {
    const registry = createRegistry();
    const execute = vi.fn().mockResolvedValue(undefined);
    registry.register({ data: { name: 'ping', toJSON: () => ({}) }, execute } as Command);

    const interaction = mockInteraction('ping');
    await registry.handleInteraction(interaction);

    expect(execute).toHaveBeenCalledWith(interaction);
  });

  it('replies with an ephemeral message when the command throws InsufficientBalanceError', async () => {
    const registry = createRegistry();
    registry.register({
      data: { name: 'pay', toJSON: () => ({}) },
      execute: async () => {
        throw new InsufficientBalanceError('u1', 100, 10);
      },
    } as Command);

    const interaction = mockInteraction('pay');
    await registry.handleInteraction(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true, content: expect.stringContaining("don't have enough") }),
    );
  });

  it('replies with remaining time when the command throws OnCooldownError', async () => {
    const registry = createRegistry();
    registry.register({
      data: { name: 'daily', toJSON: () => ({}) },
      execute: async () => {
        throw new OnCooldownError(45);
      },
    } as Command);

    const interaction = mockInteraction('daily');
    await registry.handleInteraction(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true, content: expect.stringContaining('45') }),
    );
  });

  it('does nothing when no command matches the interaction name', async () => {
    const registry = createRegistry();
    const interaction = mockInteraction('unknown');
    await expect(registry.handleInteraction(interaction)).resolves.toBeUndefined();
    expect(interaction.reply).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/commands/registry.test.ts`
Expected: FAIL with "Cannot find module '../../src/commands/registry.js'"

- [ ] **Step 3: Add `handleCommandError` to `src/errors.ts`**

```typescript
// append to src/errors.ts
import type { ChatInputCommandInteraction } from 'discord.js';

export async function handleCommandError(interaction: ChatInputCommandInteraction, error: unknown): Promise<void> {
  let content = 'Something went wrong running that command.';

  if (error instanceof InsufficientBalanceError) {
    content = "You don't have enough balance for that.";
  } else if (error instanceof OnCooldownError) {
    content = `That's on cooldown. Try again in ${error.remainingSeconds}s.`;
  } else {
    console.error('Unhandled command error:', error);
  }

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, ephemeral: true });
  } else {
    await interaction.reply({ content, ephemeral: true });
  }
}
```

- [ ] **Step 4: Write `src/commands/types.ts`**

```typescript
import type { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';

export interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
```

- [ ] **Step 5: Implement `src/commands/registry.ts`**

```typescript
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './types.js';
import { handleCommandError } from '../errors.js';

export function createRegistry() {
  const commands = new Map<string, Command>();

  return {
    register(command: Command) {
      commands.set(command.data.name, command);
    },
    get(name: string) {
      return commands.get(name);
    },
    async handleInteraction(interaction: ChatInputCommandInteraction) {
      const command = commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        await handleCommandError(interaction, error);
      }
    },
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/commands/registry.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/errors.ts src/commands/types.ts src/commands/registry.ts tests/commands/registry.test.ts
git commit -m "feat: command registry with centralized interaction error handling"
```

---

## Task 10: `/balance` and `/leaderboard` commands

**Files:**
- Create: `src/commands/economy/balance.ts`, `src/commands/economy/leaderboard.ts`
- Test: `tests/commands/balance.test.ts`, `tests/commands/leaderboard.test.ts`

**Interfaces:**
- Consumes: `getBalance` (Task 4), `getBotConfig` (Task 6), `getGuildLeaderboard`/`getGlobalLeaderboard` (Task 8), `Command` type (Task 9).
- Produces: `export const balanceCommand: (db: Db, redis: Redis) => Command` and `export const leaderboardCommand: (db: Db, redis: Redis) => Command`. Both are factory functions so `db`/`redis` are injected once at bot startup, keeping `execute` free of module-level singletons.

- [ ] **Step 1: Write the failing test for `/balance`**

```typescript
// tests/commands/balance.test.ts
import { describe, it, expect, vi } from 'vitest';
import { balanceCommand } from '../../src/commands/economy/balance.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/balance command', () => {
  it('replies with the caller\'s balance formatted with the currency symbol', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = balanceCommand(db, redis);

    vi.spyOn(await import('../../src/lib/economy.js'), 'getBalance').mockResolvedValue(250);
    vi.spyOn(await import('../../src/lib/config.js'), 'getBotConfig').mockResolvedValue({
      currencyName: 'Coins',
      currencySymbol: '🪙',
      dailyAmount: 100,
      workMin: 20,
      workMax: 80,
    });

    const interaction = {
      user: { id: 'u1' },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('250') }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/commands/balance.test.ts`
Expected: FAIL with "Cannot find module '../../src/commands/economy/balance.js'"

- [ ] **Step 3: Implement `src/commands/economy/balance.ts`**

```typescript
import { SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { getBalance } from '../../lib/economy.js';
import { getBotConfig } from '../../lib/config.js';

export function balanceCommand(db: Db, redis: Redis): Command {
  return {
    data: new SlashCommandBuilder().setName('balance').setDescription('Check your universal balance'),
    async execute(interaction) {
      const [balance, config] = await Promise.all([
        getBalance(db, interaction.user.id),
        getBotConfig(db, redis),
      ]);

      await interaction.reply({
        content: `You have ${balance} ${config.currencySymbol} ${config.currencyName}.`,
      });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/commands/balance.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for `/leaderboard`**

```typescript
// tests/commands/leaderboard.test.ts
import { describe, it, expect, vi } from 'vitest';
import { leaderboardCommand } from '../../src/commands/economy/leaderboard.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/leaderboard command', () => {
  it('shows the guild leaderboard by default', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = leaderboardCommand(db, redis);

    vi.spyOn(await import('../../src/lib/leaderboard.js'), 'getGuildLeaderboard').mockResolvedValue([
      { userId: 'a', balance: 300 },
      { userId: 'b', balance: 100 },
    ]);

    const interaction = {
      guildId: 'guild-1',
      options: { getSubcommand: () => 'guild' },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    const [[payload]] = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls;
    expect(payload.content).toContain('a');
    expect(payload.content).toContain('300');
  });

  it('shows the global leaderboard for the "global" subcommand', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = leaderboardCommand(db, redis);

    vi.spyOn(await import('../../src/lib/leaderboard.js'), 'getGlobalLeaderboard').mockResolvedValue([
      { userId: 'c', balance: 900 },
    ]);

    const interaction = {
      guildId: 'guild-1',
      options: { getSubcommand: () => 'global' },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    const [[payload]] = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls;
    expect(payload.content).toContain('c');
    expect(payload.content).toContain('900');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/commands/leaderboard.test.ts`
Expected: FAIL with "Cannot find module '../../src/commands/economy/leaderboard.js'"

- [ ] **Step 7: Implement `src/commands/economy/leaderboard.ts`**

```typescript
import { SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { getGuildLeaderboard, getGlobalLeaderboard, type LeaderboardEntry } from '../../lib/leaderboard.js';

function formatBoard(entries: LeaderboardEntry[]): string {
  return entries.map((e, i) => `${i + 1}. <@${e.userId}> — ${e.balance}`).join('\n') || 'No one has a balance yet.';
}

export function leaderboardCommand(db: Db, redis: Redis): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Show top balances')
      .addSubcommand((sub) => sub.setName('guild').setDescription('Top balances in this server'))
      .addSubcommand((sub) => sub.setName('global').setDescription('Top balances across every server')),
    async execute(interaction) {
      const subcommand = interaction.options.getSubcommand();

      const entries =
        subcommand === 'global'
          ? await getGlobalLeaderboard(db, redis)
          : await getGuildLeaderboard(db, redis, interaction.guildId!);

      await interaction.reply({ content: formatBoard(entries) });
    },
  };
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/commands/leaderboard.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add src/commands/economy/balance.ts src/commands/economy/leaderboard.ts tests/commands/balance.test.ts tests/commands/leaderboard.test.ts
git commit -m "feat: /balance and /leaderboard commands"
```

---

## Task 11: `/daily` and `/work` commands

**Files:**
- Create: `src/commands/economy/daily.ts`, `src/commands/economy/work.ts`
- Test: `tests/commands/daily.test.ts`, `tests/commands/work.test.ts`

**Interfaces:**
- Consumes: `credit` (Task 4), `getCooldownRemaining`/`setCooldown` (Task 5), `getBotConfig` (Task 6), `OnCooldownError` (Task 9).
- Produces: `export const dailyCommand: (db: Db, redis: Redis) => Command`, `export const workCommand: (db: Db, redis: Redis) => Command`.

- [ ] **Step 1: Write the failing test for `/daily`**

```typescript
// tests/commands/daily.test.ts
import { describe, it, expect, vi } from 'vitest';
import { dailyCommand } from '../../src/commands/economy/daily.js';
import { OnCooldownError } from '../../src/errors.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/daily command', () => {
  it('credits the daily amount and sets a 24h cooldown when not on cooldown', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = dailyCommand(db, redis);

    vi.spyOn(await import('../../src/lib/cooldowns.js'), 'getCooldownRemaining').mockResolvedValue(0);
    const setCooldown = vi.spyOn(await import('../../src/lib/cooldowns.js'), 'setCooldown').mockResolvedValue(undefined);
    const credit = vi.spyOn(await import('../../src/lib/economy.js'), 'credit').mockResolvedValue(undefined);
    vi.spyOn(await import('../../src/lib/config.js'), 'getBotConfig').mockResolvedValue({
      currencyName: 'Coins', currencySymbol: '🪙', dailyAmount: 100, workMin: 20, workMax: 80,
    });

    const interaction = {
      user: { id: 'u1' },
      guildId: 'g1',
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(credit).toHaveBeenCalledWith(db, 'u1', 100, 'daily', 'g1');
    expect(setCooldown).toHaveBeenCalledWith(redis, 'daily', 'u1', 86400);
  });

  it('throws OnCooldownError when already claimed today', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = dailyCommand(db, redis);

    vi.spyOn(await import('../../src/lib/cooldowns.js'), 'getCooldownRemaining').mockResolvedValue(3600);

    const interaction = {
      user: { id: 'u1' },
      guildId: 'g1',
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await expect(command.execute(interaction)).rejects.toThrow(OnCooldownError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/commands/daily.test.ts`
Expected: FAIL with "Cannot find module '../../src/commands/economy/daily.js'"

- [ ] **Step 3: Implement `src/commands/economy/daily.ts`**

```typescript
import { SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { credit } from '../../lib/economy.js';
import { getCooldownRemaining, setCooldown } from '../../lib/cooldowns.js';
import { getBotConfig } from '../../lib/config.js';
import { OnCooldownError } from '../../errors.js';

const DAY_SECONDS = 86400;

export function dailyCommand(db: Db, redis: Redis): Command {
  return {
    data: new SlashCommandBuilder().setName('daily').setDescription('Claim your daily reward'),
    async execute(interaction) {
      const remaining = await getCooldownRemaining(redis, 'daily', interaction.user.id);
      if (remaining > 0) {
        throw new OnCooldownError(remaining);
      }

      const config = await getBotConfig(db, redis);
      await credit(db, interaction.user.id, config.dailyAmount, 'daily', interaction.guildId ?? null);
      await setCooldown(redis, 'daily', interaction.user.id, DAY_SECONDS);

      await interaction.reply({
        content: `You claimed your daily ${config.dailyAmount} ${config.currencySymbol} ${config.currencyName}!`,
      });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/commands/daily.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for `/work`**

```typescript
// tests/commands/work.test.ts
import { describe, it, expect, vi } from 'vitest';
import { workCommand } from '../../src/commands/economy/work.js';
import { OnCooldownError } from '../../src/errors.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/work command', () => {
  it('credits an amount within [workMin, workMax] and sets a 1h cooldown', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = workCommand(db, redis);

    vi.spyOn(await import('../../src/lib/cooldowns.js'), 'getCooldownRemaining').mockResolvedValue(0);
    const setCooldown = vi.spyOn(await import('../../src/lib/cooldowns.js'), 'setCooldown').mockResolvedValue(undefined);
    const credit = vi.spyOn(await import('../../src/lib/economy.js'), 'credit').mockResolvedValue(undefined);
    vi.spyOn(await import('../../src/lib/config.js'), 'getBotConfig').mockResolvedValue({
      currencyName: 'Coins', currencySymbol: '🪙', dailyAmount: 100, workMin: 20, workMax: 80,
    });

    const interaction = {
      user: { id: 'u1' },
      guildId: 'g1',
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(setCooldown).toHaveBeenCalledWith(redis, 'work', 'u1', 3600);
    const [, , amount] = credit.mock.calls[0];
    expect(amount).toBeGreaterThanOrEqual(20);
    expect(amount).toBeLessThanOrEqual(80);
  });

  it('throws OnCooldownError when already worked this hour', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = workCommand(db, redis);

    vi.spyOn(await import('../../src/lib/cooldowns.js'), 'getCooldownRemaining').mockResolvedValue(120);

    const interaction = {
      user: { id: 'u1' },
      guildId: 'g1',
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await expect(command.execute(interaction)).rejects.toThrow(OnCooldownError);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/commands/work.test.ts`
Expected: FAIL with "Cannot find module '../../src/commands/economy/work.js'"

- [ ] **Step 7: Implement `src/commands/economy/work.ts`**

```typescript
import { SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { credit } from '../../lib/economy.js';
import { getCooldownRemaining, setCooldown } from '../../lib/cooldowns.js';
import { getBotConfig } from '../../lib/config.js';
import { OnCooldownError } from '../../errors.js';

const HOUR_SECONDS = 3600;

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function workCommand(db: Db, redis: Redis): Command {
  return {
    data: new SlashCommandBuilder().setName('work').setDescription('Work for a random reward'),
    async execute(interaction) {
      const remaining = await getCooldownRemaining(redis, 'work', interaction.user.id);
      if (remaining > 0) {
        throw new OnCooldownError(remaining);
      }

      const config = await getBotConfig(db, redis);
      const amount = randomInRange(config.workMin, config.workMax);
      await credit(db, interaction.user.id, amount, 'work', interaction.guildId ?? null);
      await setCooldown(redis, 'work', interaction.user.id, HOUR_SECONDS);

      await interaction.reply({
        content: `You worked and earned ${amount} ${config.currencySymbol} ${config.currencyName}!`,
      });
    },
  };
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/commands/work.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add src/commands/economy/daily.ts src/commands/economy/work.ts tests/commands/daily.test.ts tests/commands/work.test.ts
git commit -m "feat: /daily and /work commands with global per-user cooldowns"
```

---

## Task 12: `/pay` command plus concurrency integration test

**Files:**
- Create: `src/commands/economy/pay.ts`
- Test: `tests/commands/pay.test.ts`, `tests/integration/pay.integration.test.ts`

**Interfaces:**
- Consumes: `transfer` (Task 4), `invalidateLeaderboardCache` (Task 8).
- Produces: `export const payCommand: (db: Db, redis: Redis) => Command`.

- [ ] **Step 1: Write the failing unit test**

```typescript
// tests/commands/pay.test.ts
import { describe, it, expect, vi } from 'vitest';
import { payCommand } from '../../src/commands/economy/pay.js';
import { InsufficientBalanceError } from '../../src/errors.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/pay command', () => {
  it('transfers the amount and replies with confirmation', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = payCommand(db, redis);

    const transfer = vi.spyOn(await import('../../src/lib/economy.js'), 'transfer').mockResolvedValue(undefined);
    vi.spyOn(await import('../../src/lib/leaderboard.js'), 'invalidateLeaderboardCache').mockResolvedValue(undefined);

    const interaction = {
      user: { id: 'sender' },
      guildId: 'g1',
      options: {
        getUser: () => ({ id: 'recipient', bot: false }),
        getInteger: () => 50,
      },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(transfer).toHaveBeenCalledWith(db, 'sender', 'recipient', 50, 'g1');
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('50') }));
  });

  it('rejects paying a bot user without calling transfer', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = payCommand(db, redis);

    const transfer = vi.spyOn(await import('../../src/lib/economy.js'), 'transfer').mockResolvedValue(undefined);

    const interaction = {
      user: { id: 'sender' },
      guildId: 'g1',
      options: {
        getUser: () => ({ id: 'bot-1', bot: true }),
        getInteger: () => 50,
      },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(transfer).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('bot') }));
  });

  it('propagates InsufficientBalanceError from transfer', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = payCommand(db, redis);

    vi.spyOn(await import('../../src/lib/economy.js'), 'transfer').mockRejectedValue(
      new InsufficientBalanceError('sender', 50, 10),
    );

    const interaction = {
      user: { id: 'sender' },
      guildId: 'g1',
      options: {
        getUser: () => ({ id: 'recipient', bot: false }),
        getInteger: () => 50,
      },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await expect(command.execute(interaction)).rejects.toThrow(InsufficientBalanceError);
  });
});
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `npx vitest run tests/commands/pay.test.ts`
Expected: FAIL with "Cannot find module '../../src/commands/economy/pay.js'"

- [ ] **Step 3: Implement `src/commands/economy/pay.ts`**

```typescript
import { SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { transfer } from '../../lib/economy.js';
import { invalidateLeaderboardCache } from '../../lib/leaderboard.js';

export function payCommand(db: Db, redis: Redis): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('pay')
      .setDescription('Send some of your balance to another user')
      .addUserOption((opt) => opt.setName('user').setDescription('Who to pay').setRequired(true))
      .addIntegerOption((opt) => opt.setName('amount').setDescription('How much to send').setRequired(true).setMinValue(1)),
    async execute(interaction) {
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);

      if (target.bot) {
        await interaction.reply({ content: "You can't pay a bot.", ephemeral: true });
        return;
      }

      await transfer(db, interaction.user.id, target.id, amount, interaction.guildId ?? null);
      await invalidateLeaderboardCache(redis, interaction.guildId ?? undefined);
      await invalidateLeaderboardCache(redis);

      await interaction.reply({ content: `Sent ${amount} to <@${target.id}>.` });
    },
  };
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run tests/commands/pay.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the concurrency integration test**

```typescript
// tests/integration/pay.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { users, transactions } from '../../src/db/schema.js';
import { transfer } from '../../src/lib/economy.js';
import { inArray } from 'drizzle-orm';
import { eq } from 'drizzle-orm';

const db = createDb(process.env.DATABASE_URL ?? 'postgres://cashy:cashy@localhost:5432/cashy');

describe('transfer concurrency', () => {
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
      transfer(db, 'race-a', 'race-b', 80, null),
      transfer(db, 'race-a', 'race-b', 80, null),
    ]);

    const [{ balance: senderBalance }] = await db.select().from(users).where(eq(users.userId, 'race-a'));
    expect(senderBalance).toBeGreaterThanOrEqual(0);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });
});
```

- [ ] **Step 6: Run the integration test to verify it passes**

Run: `npx vitest run tests/integration/pay.integration.test.ts`
Expected: PASS — exactly one of the two concurrent transfers succeeds, sender balance never goes negative (proves the `for('update')` row lock in `debit`/`transfer` from Task 4 works)

- [ ] **Step 7: Commit**

```bash
git add src/commands/economy/pay.ts tests/commands/pay.test.ts tests/integration/pay.integration.test.ts
git commit -m "feat: /pay command with concurrency-safe transfer integration test"
```

---

## Task 13: Guild membership sync (for guild-scoped leaderboard)

**Files:**
- Create: `src/events/guildMember.ts`
- Test: `tests/events/guildMember.test.ts`

**Interfaces:**
- Consumes: `Db`, `guildMembers` table.
- Produces: `export async function onGuildMemberAdd(db: Db, guildId: string, userId: string): Promise<void>`, `export async function onGuildMemberRemove(db: Db, guildId: string, userId: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/events/guildMember.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { guildMembers } from '../../src/db/schema.js';
import { onGuildMemberAdd, onGuildMemberRemove } from '../../src/events/guildMember.js';
import { and, eq } from 'drizzle-orm';

const db = createDb(process.env.DATABASE_URL ?? 'postgres://cashy:cashy@localhost:5432/cashy');

describe('guild member sync', () => {
  beforeEach(async () => {
    await db.delete(guildMembers).where(and(eq(guildMembers.guildId, 'gm-guild'), eq(guildMembers.userId, 'gm-user')));
  });

  it('onGuildMemberAdd inserts a row with inGuild = true', async () => {
    await onGuildMemberAdd(db, 'gm-guild', 'gm-user');
    const [row] = await db
      .select()
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, 'gm-guild'), eq(guildMembers.userId, 'gm-user')));
    expect(row.inGuild).toBe(true);
  });

  it('onGuildMemberRemove flips inGuild to false without deleting the row', async () => {
    await onGuildMemberAdd(db, 'gm-guild', 'gm-user');
    await onGuildMemberRemove(db, 'gm-guild', 'gm-user');
    const [row] = await db
      .select()
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, 'gm-guild'), eq(guildMembers.userId, 'gm-user')));
    expect(row.inGuild).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/events/guildMember.test.ts`
Expected: FAIL with "Cannot find module '../../src/events/guildMember.js'"

- [ ] **Step 3: Implement `src/events/guildMember.ts`**

```typescript
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { guildMembers } from '../db/schema.js';

export async function onGuildMemberAdd(db: Db, guildId: string, userId: string): Promise<void> {
  await db
    .insert(guildMembers)
    .values({ guildId, userId, inGuild: true })
    .onConflictDoUpdate({
      target: [guildMembers.guildId, guildMembers.userId],
      set: { inGuild: true },
    });
}

export async function onGuildMemberRemove(db: Db, guildId: string, userId: string): Promise<void> {
  await db
    .update(guildMembers)
    .set({ inGuild: false })
    .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)));
}
```

- [ ] **Step 4: Add a composite primary key on `(guildId, userId)` to `guildMembers` in `src/db/schema.ts`**

```typescript
// modify src/db/schema.ts: replace the guildMembers definition with:
import { primaryKey } from 'drizzle-orm/pg-core';

export const guildMembers = pgTable(
  'guild_members',
  {
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    inGuild: boolean('in_guild').notNull().default(true),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.guildId, table.userId] }),
  }),
);
```

- [ ] **Step 5: Generate and apply the migration for the new primary key**

Run: `npx drizzle-kit generate && npx tsx src/db/migrate.ts`
Expected: new migration file generated and applied without error

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/events/guildMember.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add src/events/guildMember.ts src/db/schema.ts drizzle tests/events/guildMember.test.ts
git commit -m "feat: sync guild membership for guild-scoped leaderboard filtering"
```

---

## Task 14: Shop commands (`/shop view`, `/shop buy`)

**Files:**
- Create: `src/commands/shop/view.ts`, `src/commands/shop/buy.ts`
- Test: `tests/commands/shopView.test.ts`, `tests/commands/shopBuy.test.ts`

**Interfaces:**
- Consumes: `debit` (Task 4), `shopItems` table (Task 2).
- Produces: `export const shopViewCommand: (db: Db) => Command`, `export const shopBuyCommand: (db: Db, redis: Redis) => Command`.

- [ ] **Step 1: Write the failing test for `/shop view`**

```typescript
// tests/commands/shopView.test.ts
import { describe, it, expect, vi } from 'vitest';
import { shopViewCommand } from '../../src/commands/shop/view.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/shop view command', () => {
  it('lists items for the current guild', async () => {
    const db = { select: vi.fn(), from: vi.fn(), where: vi.fn() } as never;
    const command = shopViewCommand(db);

    vi.spyOn(command as never, 'execute'); // no-op guard to keep imports live

    const listSpy = vi.spyOn(await import('../../src/commands/shop/view.js'), 'listShopItems').mockResolvedValue([
      { id: '1', guildId: 'g1', name: 'VIP Role', price: 500, roleId: 'role-1', description: null },
    ]);

    const interaction = {
      guildId: 'g1',
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(listSpy).toHaveBeenCalledWith(db, 'g1');
    const [[payload]] = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls;
    expect(payload.content).toContain('VIP Role');
    expect(payload.content).toContain('500');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/commands/shopView.test.ts`
Expected: FAIL with "Cannot find module '../../src/commands/shop/view.js'"

- [ ] **Step 3: Implement `src/commands/shop/view.ts`**

```typescript
import { eq } from 'drizzle-orm';
import { SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Command } from '../types.js';
import { shopItems } from '../../db/schema.js';

export async function listShopItems(db: Db, guildId: string) {
  return db.select().from(shopItems).where(eq(shopItems.guildId, guildId));
}

export function shopViewCommand(db: Db): Command {
  return {
    data: new SlashCommandBuilder().setName('shop-view').setDescription('View this server\'s shop'),
    async execute(interaction) {
      const items = await listShopItems(db, interaction.guildId!);
      const content = items.length
        ? items.map((i) => `**${i.name}** — ${i.price} — <@&${i.roleId}>${i.description ? `\n${i.description}` : ''}`).join('\n\n')
        : 'This server has no shop items yet.';

      await interaction.reply({ content });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/commands/shopView.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for `/shop buy`**

```typescript
// tests/commands/shopBuy.test.ts
import { describe, it, expect, vi } from 'vitest';
import { shopBuyCommand } from '../../src/commands/shop/buy.js';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';

describe('/shop buy command', () => {
  it('debits the price and assigns the role when the item exists', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = shopBuyCommand(db, redis);

    vi.spyOn(await import('../../src/commands/shop/buy.js'), 'findShopItem').mockResolvedValue({
      id: '1', guildId: 'g1', name: 'VIP Role', price: 500, roleId: 'role-1', description: null,
    });
    const debit = vi.spyOn(await import('../../src/lib/economy.js'), 'debit').mockResolvedValue(undefined);
    const addRole = vi.fn();

    const interaction = {
      guildId: 'g1',
      user: { id: 'u1' },
      options: { getString: () => '1' },
      member: { roles: { add: addRole } } as unknown as GuildMember,
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(debit).toHaveBeenCalledWith(db, 'u1', 500, 'shop_purchase', 'g1');
    expect(addRole).toHaveBeenCalledWith('role-1');
  });

  it('replies with an error and does not debit when the item does not exist', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = shopBuyCommand(db, redis);

    vi.spyOn(await import('../../src/commands/shop/buy.js'), 'findShopItem').mockResolvedValue(undefined);
    const debit = vi.spyOn(await import('../../src/lib/economy.js'), 'debit').mockResolvedValue(undefined);

    const interaction = {
      guildId: 'g1',
      user: { id: 'u1' },
      options: { getString: () => 'missing' },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(debit).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('not found') }));
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/commands/shopBuy.test.ts`
Expected: FAIL with "Cannot find module '../../src/commands/shop/buy.js'"

- [ ] **Step 7: Implement `src/commands/shop/buy.ts`**

```typescript
import { and, eq } from 'drizzle-orm';
import { SlashCommandBuilder, type GuildMember } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { shopItems } from '../../db/schema.js';
import { debit } from '../../lib/economy.js';

export async function findShopItem(db: Db, guildId: string, itemId: string) {
  const [item] = await db
    .select()
    .from(shopItems)
    .where(and(eq(shopItems.guildId, guildId), eq(shopItems.id, itemId)));
  return item;
}

export function shopBuyCommand(db: Db, _redis: Redis): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('shop-buy')
      .setDescription('Buy an item from this server\'s shop')
      .addStringOption((opt) => opt.setName('item-id').setDescription('The item id from /shop-view').setRequired(true)),
    async execute(interaction) {
      const itemId = interaction.options.getString('item-id', true);
      const item = await findShopItem(db, interaction.guildId!, itemId);

      if (!item) {
        await interaction.reply({ content: 'Item not found in this server\'s shop.', ephemeral: true });
        return;
      }

      await debit(db, interaction.user.id, item.price, 'shop_purchase', interaction.guildId!);
      await (interaction.member as GuildMember).roles.add(item.roleId);

      await interaction.reply({ content: `You bought **${item.name}**!` });
    },
  };
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/commands/shopBuy.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add src/commands/shop/view.ts src/commands/shop/buy.ts tests/commands/shopView.test.ts tests/commands/shopBuy.test.ts
git commit -m "feat: /shop-view and /shop-buy commands"
```

---

## Task 15: Guild-admin shop management (`/shop-add`, `/shop-remove`)

**Files:**
- Create: `src/commands/shop/admin.ts`
- Test: `tests/commands/shopAdmin.test.ts`

**Interfaces:**
- Consumes: `shopItems` table.
- Produces: `export const shopAddCommand: (db: Db) => Command`, `export const shopRemoveCommand: (db: Db) => Command`. Both declare `.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)` so only guild admins see/use them — this is a Discord-side permission gate on a per-guild-scoped action, distinct from the owner-only gate in Task 16.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/commands/shopAdmin.test.ts
import { describe, it, expect, vi } from 'vitest';
import { shopAddCommand, shopRemoveCommand } from '../../src/commands/shop/admin.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/shop-add and /shop-remove commands', () => {
  it('shop-add declares ManageGuild as the default member permission', () => {
    const command = shopAddCommand({} as never);
    expect(command.data.toJSON().default_member_permissions).toBeDefined();
  });

  it('shop-add inserts a new shop item scoped to the interaction guild', async () => {
    const db = {} as never;
    const command = shopAddCommand(db);

    const insertValues = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(await import('../../src/commands/shop/admin.js'), 'insertShopItem').mockImplementation(insertValues);

    const interaction = {
      guildId: 'g1',
      options: {
        getString: (name: string) => (name === 'name' ? 'VIP Role' : 'desc'),
        getInteger: () => 500,
        getRole: () => ({ id: 'role-1' }),
      },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(insertValues).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ guildId: 'g1', name: 'VIP Role', price: 500, roleId: 'role-1' }),
    );
  });

  it('shop-remove deletes an item scoped to the interaction guild', async () => {
    const db = {} as never;
    const command = shopRemoveCommand(db);

    const deleteItem = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(await import('../../src/commands/shop/admin.js'), 'deleteShopItem').mockImplementation(deleteItem);

    const interaction = {
      guildId: 'g1',
      options: { getString: () => 'item-1' },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(deleteItem).toHaveBeenCalledWith(db, 'g1', 'item-1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/commands/shopAdmin.test.ts`
Expected: FAIL with "Cannot find module '../../src/commands/shop/admin.js'"

- [ ] **Step 3: Implement `src/commands/shop/admin.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Command } from '../types.js';
import { shopItems } from '../../db/schema.js';

export async function insertShopItem(
  db: Db,
  item: { guildId: string; name: string; price: number; roleId: string; description: string | null },
) {
  await db.insert(shopItems).values({ id: randomUUID(), ...item });
}

export async function deleteShopItem(db: Db, guildId: string, itemId: string) {
  await db.delete(shopItems).where(and(eq(shopItems.guildId, guildId), eq(shopItems.id, itemId)));
}

export function shopAddCommand(db: Db): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('shop-add')
      .setDescription('Add an item to this server\'s shop')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((opt) => opt.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption((opt) => opt.setName('price').setDescription('Price').setRequired(true).setMinValue(1))
      .addRoleOption((opt) => opt.setName('role').setDescription('Role to grant').setRequired(true))
      .addStringOption((opt) => opt.setName('description').setDescription('Item description').setRequired(false)),
    async execute(interaction) {
      const name = interaction.options.getString('name', true);
      const price = interaction.options.getInteger('price', true);
      const role = interaction.options.getRole('role', true);
      const description = interaction.options.getString('description');

      await insertShopItem(db, { guildId: interaction.guildId!, name, price, roleId: role.id, description });

      await interaction.reply({ content: `Added **${name}** for ${price}.` });
    },
  };
}

export function shopRemoveCommand(db: Db): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('shop-remove')
      .setDescription('Remove an item from this server\'s shop')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((opt) => opt.setName('item-id').setDescription('The item id from /shop-view').setRequired(true)),
    async execute(interaction) {
      const itemId = interaction.options.getString('item-id', true);
      await deleteShopItem(db, interaction.guildId!, itemId);
      await interaction.reply({ content: 'Item removed.' });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/commands/shopAdmin.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/shop/admin.ts tests/commands/shopAdmin.test.ts
git commit -m "feat: guild-admin /shop-add and /shop-remove, scoped to their own guild"
```

---

## Task 16: Owner-only commands (`/owner mint`, `/owner adjust-balance`, `/owner set-config`)

**Files:**
- Create: `src/commands/owner/owner.ts`
- Test: `tests/commands/owner.test.ts`

**Interfaces:**
- Consumes: `isOwner` (Task 7), `credit`/`debit` (Task 4), `setBotConfig` (Task 6).
- Produces: `export const ownerCommand: (db: Db, redis: Redis, ownerIds: string[]) => Command` — a single command with three subcommands (`mint`, `adjust-balance`, `set-config`). Every subcommand checks `isOwner(ownerIds, interaction.user.id)` first and replies with a rejection if false, **regardless of Discord permissions** — this is the only place in the codebase allowed to call `credit`/`debit` with type `'owner_adjust'` or call `setBotConfig`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/commands/owner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ownerCommand } from '../../src/commands/owner/owner.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/owner command', () => {
  it('rejects a non-owner user before touching the database', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = ownerCommand(db, redis, ['owner-1']);

    const credit = vi.spyOn(await import('../../src/lib/economy.js'), 'credit').mockResolvedValue(undefined);

    const interaction = {
      user: { id: 'not-owner' },
      options: {
        getSubcommand: () => 'mint',
        getUser: () => ({ id: 'target' }),
        getInteger: () => 1000,
      },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(credit).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('not authorized'), ephemeral: true }),
    );
  });

  it('mint credits the target user when called by an owner', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = ownerCommand(db, redis, ['owner-1']);

    const credit = vi.spyOn(await import('../../src/lib/economy.js'), 'credit').mockResolvedValue(undefined);

    const interaction = {
      user: { id: 'owner-1' },
      guildId: null,
      options: {
        getSubcommand: () => 'mint',
        getUser: () => ({ id: 'target' }),
        getInteger: () => 1000,
      },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(credit).toHaveBeenCalledWith(db, 'target', 1000, 'owner_adjust', null);
  });

  it('adjust-balance debits when the amount is negative', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = ownerCommand(db, redis, ['owner-1']);

    const debit = vi.spyOn(await import('../../src/lib/economy.js'), 'debit').mockResolvedValue(undefined);

    const interaction = {
      user: { id: 'owner-1' },
      guildId: null,
      options: {
        getSubcommand: () => 'adjust-balance',
        getUser: () => ({ id: 'target' }),
        getInteger: () => -200,
      },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(debit).toHaveBeenCalledWith(db, 'target', 200, 'owner_adjust', null);
  });

  it('set-config updates currency name via setBotConfig', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = ownerCommand(db, redis, ['owner-1']);

    const setConfig = vi.spyOn(await import('../../src/lib/config.js'), 'setBotConfig').mockResolvedValue({
      currencyName: 'Shells', currencySymbol: '🐚', dailyAmount: 100, workMin: 20, workMax: 80,
    });

    const interaction = {
      user: { id: 'owner-1' },
      options: {
        getSubcommand: () => 'set-config',
        getString: (name: string) => (name === 'currency-name' ? 'Shells' : null),
        getInteger: () => null,
      },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(setConfig).toHaveBeenCalledWith(db, redis, expect.objectContaining({ currencyName: 'Shells' }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/commands/owner.test.ts`
Expected: FAIL with "Cannot find module '../../src/commands/owner/owner.js'"

- [ ] **Step 3: Implement `src/commands/owner/owner.ts`**

```typescript
import { SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { credit, debit } from '../../lib/economy.js';
import { setBotConfig, type BotConfig } from '../../lib/config.js';
import { isOwner } from '../../lib/permissions.js';

export function ownerCommand(db: Db, redis: Redis, ownerIds: string[]): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('owner')
      .setDescription('Bot-owner-only currency administration')
      .addSubcommand((sub) =>
        sub
          .setName('mint')
          .setDescription('Create currency for a user')
          .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
          .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount to mint').setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('adjust-balance')
          .setDescription('Add or remove currency from a user (negative to remove)')
          .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
          .addIntegerOption((opt) => opt.setName('amount').setDescription('Positive to add, negative to remove').setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('set-config')
          .setDescription('Update the global currency identity')
          .addStringOption((opt) => opt.setName('currency-name').setDescription('New currency name').setRequired(false))
          .addStringOption((opt) => opt.setName('currency-symbol').setDescription('New currency symbol').setRequired(false))
          .addIntegerOption((opt) => opt.setName('daily-amount').setDescription('New /daily amount').setRequired(false)),
      ),
    async execute(interaction) {
      if (!isOwner(ownerIds, interaction.user.id)) {
        await interaction.reply({ content: 'You are not authorized to use this command.', ephemeral: true });
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'mint') {
        const target = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);
        await credit(db, target.id, amount, 'owner_adjust', interaction.guildId ?? null);
        await interaction.reply({ content: `Minted ${amount} for <@${target.id}>.`, ephemeral: true });
        return;
      }

      if (subcommand === 'adjust-balance') {
        const target = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);

        if (amount >= 0) {
          await credit(db, target.id, amount, 'owner_adjust', interaction.guildId ?? null);
        } else {
          await debit(db, target.id, Math.abs(amount), 'owner_adjust', interaction.guildId ?? null);
        }

        await interaction.reply({ content: `Adjusted <@${target.id}> by ${amount}.`, ephemeral: true });
        return;
      }

      // set-config
      const patch: Partial<BotConfig> = {};
      const currencyName = interaction.options.getString('currency-name');
      const currencySymbol = interaction.options.getString('currency-symbol');
      const dailyAmount = interaction.options.getInteger('daily-amount');
      if (currencyName) patch.currencyName = currencyName;
      if (currencySymbol) patch.currencySymbol = currencySymbol;
      if (dailyAmount) patch.dailyAmount = dailyAmount;

      const updated = await setBotConfig(db, redis, patch);
      await interaction.reply({ content: `Config updated: ${JSON.stringify(updated)}`, ephemeral: true });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/commands/owner.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/owner/owner.ts tests/commands/owner.test.ts
git commit -m "feat: bot-owner-only /owner mint, adjust-balance, and set-config"
```

---

## Task 17: Bot bootstrap, sharding entry point, and deploy-commands script

**Files:**
- Create: `src/bot.ts`, `src/shard.ts`, `scripts/deploy-commands.ts`
- Test: `tests/bot.test.ts`

**Interfaces:**
- Consumes: every command factory from Tasks 10–16, `createDb`, `createRedis`, `loadEnv`, `onGuildMemberAdd`/`onGuildMemberRemove`, `createRegistry`.
- Produces: `export function buildCommands(db: Db, redis: Redis, ownerIds: string[]): Command[]` (in `src/bot.ts`) — the single place that lists every command, so Task 17's test can assert the full command set without starting a real Discord client.

- [ ] **Step 1: Write the failing test for `buildCommands`**

```typescript
// tests/bot.test.ts
import { describe, it, expect } from 'vitest';
import { buildCommands } from '../src/bot.js';

describe('buildCommands', () => {
  it('registers every v1 command exactly once', () => {
    const db = {} as never;
    const redis = {} as never;
    const commands = buildCommands(db, redis, ['owner-1']);
    const names = commands.map((c) => c.data.name).sort();

    expect(names).toEqual(
      [
        'balance',
        'daily',
        'leaderboard',
        'owner',
        'pay',
        'shop-add',
        'shop-buy',
        'shop-remove',
        'shop-view',
        'work',
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/bot.test.ts`
Expected: FAIL with "Cannot find module '../src/bot.js'"

- [ ] **Step 3: Implement `src/bot.ts`**

```typescript
import { Client, GatewayIntentBits, Events } from 'discord.js';
import type { Db } from './db/client.js';
import type { Redis } from './redis/client.js';
import type { Command } from './commands/types.js';
import { createRegistry } from './commands/registry.js';
import { balanceCommand } from './commands/economy/balance.js';
import { leaderboardCommand } from './commands/economy/leaderboard.js';
import { dailyCommand } from './commands/economy/daily.js';
import { workCommand } from './commands/economy/work.js';
import { payCommand } from './commands/economy/pay.js';
import { shopViewCommand } from './commands/shop/view.js';
import { shopBuyCommand } from './commands/shop/buy.js';
import { shopAddCommand, shopRemoveCommand } from './commands/shop/admin.js';
import { ownerCommand } from './commands/owner/owner.js';
import { onGuildMemberAdd, onGuildMemberRemove } from './events/guildMember.js';

export function buildCommands(db: Db, redis: Redis, ownerIds: string[]): Command[] {
  return [
    balanceCommand(db, redis),
    leaderboardCommand(db, redis),
    dailyCommand(db, redis),
    workCommand(db, redis),
    payCommand(db, redis),
    shopViewCommand(db),
    shopBuyCommand(db, redis),
    shopAddCommand(db),
    shopRemoveCommand(db),
    ownerCommand(db, redis, ownerIds),
  ];
}

export function createBot(db: Db, redis: Redis, ownerIds: string[]) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  const registry = createRegistry();
  for (const command of buildCommands(db, redis, ownerIds)) {
    registry.register(command);
  }

  client.once(Events.ClientReady, (c) => {
    console.log(`Logged in as ${c.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    await registry.handleInteraction(interaction);
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    await onGuildMemberAdd(db, member.guild.id, member.id);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    await onGuildMemberRemove(db, member.guild.id, member.id);
  });

  return client;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/bot.test.ts`
Expected: PASS

- [ ] **Step 5: Write `src/shard.ts`**

```typescript
import 'dotenv/config';
import { ShardingManager } from 'discord.js';
import { loadEnv } from './env.js';

const env = loadEnv(process.env);

const manager = new ShardingManager('./dist/entry.js', {
  token: env.discordToken,
  totalShards: 'auto',
});

manager.on('shardCreate', (shard) => console.log(`Launched shard ${shard.id}`));
await manager.spawn();
```

- [ ] **Step 6: Write `src/entry.ts` (the per-shard process each `ShardingManager` fork runs)**

```typescript
import 'dotenv/config';
import { loadEnv } from './env.js';
import { createDb } from './db/client.js';
import { createRedis } from './redis/client.js';
import { createBot } from './bot.js';

const env = loadEnv(process.env);
const db = createDb(env.databaseUrl);
const redis = createRedis(env.redisUrl);
const client = createBot(db, redis, env.ownerIds);

await client.login(env.discordToken);
```

- [ ] **Step 7: Write `scripts/deploy-commands.ts`**

```typescript
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { loadEnv } from '../src/env.js';
import { buildCommands } from '../src/bot.js';

const env = loadEnv(process.env);
const clientId = process.env.DISCORD_CLIENT_ID;
if (!clientId) throw new Error('Missing DISCORD_CLIENT_ID');

// db/redis are unused by command `.data` definitions but required by the factory signature
const commands = buildCommands({} as never, {} as never, env.ownerIds).map((c) => c.data.toJSON());

const rest = new REST().setToken(env.discordToken);
await rest.put(Routes.applicationCommands(clientId), { body: commands });
console.log(`Registered ${commands.length} global commands.`);
```

- [ ] **Step 8: Update `package.json` `start`/`dev` scripts to point at `dist/shard.js` / `src/shard.ts` (already set in Task 1) and confirm the build compiles**

Run: `npm run build`
Expected: compiles cleanly, `dist/shard.js` and `dist/entry.js` exist

- [ ] **Step 9: Commit**

```bash
git add src/bot.ts src/shard.ts src/entry.ts scripts/deploy-commands.ts tests/bot.test.ts
git commit -m "feat: bot bootstrap, sharding entry point, and slash command deploy script"
```

---

## Task 18: Dockerfile and Fly.io deployment config

**Files:**
- Create: `Dockerfile`, `fly.toml`, `.dockerignore`

**Interfaces:**
- None (infrastructure-only task; no application code).

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
dist
.env
.git
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
CMD ["node", "dist/shard.js"]
```

- [ ] **Step 3: Write `fly.toml`**

```toml
app = "cashy-bot"
primary_region = "iad"

[build]

[env]
  NODE_ENV = "production"

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"

[processes]
  app = "node dist/shard.js"
```

- [ ] **Step 4: Build the Docker image locally to verify it compiles**

Run: `docker build -t cashy-bot .`
Expected: image builds successfully with no errors

- [ ] **Step 5: Commit**

```bash
git add Dockerfile fly.toml .dockerignore
git commit -m "chore: Dockerfile and Fly.io deployment config"
```

---

## Task 19: Full test suite and README update

**Files:**
- Modify: `README.md`

**Interfaces:**
- None.

- [ ] **Step 1: Run the entire test suite (requires `docker compose up -d` for Postgres/Redis)**

Run: `docker compose up -d && npx drizzle-kit generate && npx tsx src/db/migrate.ts && npm test`
Expected: all unit and integration tests pass

- [ ] **Step 2: Update `README.md`'s Status and Development sections**

```markdown
<!-- replace the "## Status" and "## Development" sections in README.md with: -->
## Status

v1 implemented: universal balance, `/daily`, `/work`, `/pay`, `/leaderboard`
(guild + global), per-guild `/shop-view`/`/shop-buy`, guild-admin
`/shop-add`/`/shop-remove`, and bot-owner-only `/owner` commands. See the
design spec and implementation plan under `docs/superpowers/`.

## Development

1. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`,
   `DISCORD_CLIENT_ID`, and `OWNER_IDS` (your Discord user ID).
2. `docker compose up -d` — starts local Postgres and Redis.
3. `npm install`
4. `npx drizzle-kit generate && npm run db:migrate`
5. `npm run deploy-commands` — registers slash commands with Discord.
6. `npm run dev` — starts the bot.

Run tests with `npm test` (requires the Docker services from step 2).
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with v1 status and local dev instructions"
```

---

## Spec Coverage Check

- Universal per-user balance, no guild scoping → Tasks 2, 4
- Bot-owner-only minting/adjustment, gated by `OWNER_IDS` not Discord permissions → Tasks 7, 16
- Global per-user cooldowns for `/daily`/`/work`, Redis-backed, restart-safe → Tasks 5, 11
- Per-guild shop paid from global balance → Tasks 14, 15
- Global fixed currency identity (`bot_config`) → Tasks 6, 16
- Guild leaderboard default + global leaderboard option → Tasks 8, 10, 13
- All balance mutations through one transactional helper → Task 4 (enforced by every command task consuming only `credit`/`debit`/`transfer`)
- Concurrency-safe `/pay` → Task 12
- Sharding path wired from day one → Task 17
- Fly.io + Neon + Upstash deployment → Task 18, `.env.example` in Task 1
