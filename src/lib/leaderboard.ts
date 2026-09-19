import { desc, eq, and, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { Redis } from '../redis/client.js';
import { users, guildMembers } from '../db/schema.js';

export interface LeaderboardEntry {
  userId: string;
  balance: number;
}

const CACHE_TTL_SECONDS = 30;

export const GLOBAL_CACHE_KEY = 'cashy:leaderboard:global';

/**
 * Guild-scoped cache key. `guildId` is a required, non-empty string: an empty
 * or missing guild id must never be allowed to fall through to the global key
 * (a DM-invoked `/leaderboard guild` used to do exactly that, writing the DM's
 * empty result set over the real global leaderboard cache).
 */
function guildCacheKey(guildId: string): string {
  if (!guildId) {
    throw new Error('guildCacheKey requires a non-empty guildId');
  }
  return `cashy:leaderboard:${guildId}`;
}

export async function getGuildLeaderboard(
  db: Db,
  redis: Redis,
  guildId: string,
  limit = 10,
): Promise<LeaderboardEntry[]> {
  const key = guildCacheKey(guildId);
  const cached = await redis.get(key);
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

  await redis.set(key, JSON.stringify(rows), 'EX', CACHE_TTL_SECONDS);
  return rows;
}

export async function getGlobalLeaderboard(db: Db, redis: Redis, limit = 10): Promise<LeaderboardEntry[]> {
  const cached = await redis.get(GLOBAL_CACHE_KEY);
  if (cached) return JSON.parse(cached) as LeaderboardEntry[];

  const rows = await db
    .select({ userId: users.userId, balance: users.balance })
    .from(users)
    .orderBy(desc(users.balance))
    .limit(limit);

  await redis.set(GLOBAL_CACHE_KEY, JSON.stringify(rows), 'EX', CACHE_TTL_SECONDS);
  return rows;
}

/**
 * Invalidate cached leaderboards after a balance-affecting write.
 *
 * The global board always changes when any balance changes, so the global key
 * is dropped unconditionally. When the write happened in a guild, that guild's
 * board is dropped too. Callers should not have to remember both — this is
 * called from `lib/economy.ts`'s credit/debit/transfer, the single money path.
 */
export async function invalidateLeaderboardCache(redis: Redis, guildId?: string | null): Promise<void> {
  const keys = guildId ? [guildCacheKey(guildId), GLOBAL_CACHE_KEY] : [GLOBAL_CACHE_KEY];
  await redis.del(...keys);
}
