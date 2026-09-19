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
