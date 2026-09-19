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

/**
 * Upsert a whole guild's current membership.
 *
 * `guild_members` is only kept current by the GuildMemberAdd/Remove gateway
 * events, so without a backfill a server that installs the bot has an empty
 * `/leaderboard guild` until every member happens to leave and rejoin. This
 * runs on GuildCreate (bot joined) and on ClientReady for guilds already
 * joined while the process was offline (the Fly.io restart case).
 *
 * Kept free of discord.js types on purpose so it is unit-testable against the
 * real table: the caller resolves the member ids from the Guild object.
 */
export async function backfillGuildMembers(db: Db, guildId: string, userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;

  const unique = [...new Set(userIds)];
  // Chunked so a large guild doesn't build one enormous parameterized insert.
  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    await db
      .insert(guildMembers)
      .values(chunk.map((userId) => ({ guildId, userId, inGuild: true })))
      .onConflictDoUpdate({
        target: [guildMembers.guildId, guildMembers.userId],
        set: { inGuild: true },
      });
  }
  return unique.length;
}
