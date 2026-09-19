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
