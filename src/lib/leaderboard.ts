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
