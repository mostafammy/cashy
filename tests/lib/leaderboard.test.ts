import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { createRedis } from '../../src/redis/client.js';
import { users, guildMembers } from '../../src/db/schema.js';
import { getGuildLeaderboard, getGlobalLeaderboard, invalidateLeaderboardCache } from '../../src/lib/leaderboard.js';
import { inArray } from 'drizzle-orm';
import { requireEnv } from '../helpers/env.js';

const db = createDb(requireEnv('DATABASE_URL'));
const redis = createRedis(requireEnv('REDIS_URL'));

describe('leaderboard lib', () => {
  beforeEach(async () => {
    await db.delete(guildMembers).where(inArray(guildMembers.userId, ['lb-a', 'lb-b', 'lb-c']));
    await db.delete(users).where(inArray(users.userId, ['lb-a', 'lb-b', 'lb-c']));
    // Balances are deliberately huge and far apart so this test's fixture rows
    // reliably dominate the top of getGlobalLeaderboard even though the shared
    // remote Neon DB accumulates leftover rows from other test files' fixtures.
    await db.insert(users).values([
      { userId: 'lb-a', balance: 900_000_300 },
      { userId: 'lb-b', balance: 900_000_100 },
      { userId: 'lb-c', balance: 900_000_200 },
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
