import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { guildMembers } from '../../src/db/schema.js';
import { onGuildMemberAdd, onGuildMemberRemove, backfillGuildMembers } from '../../src/events/guildMember.js';
import { and, eq, inArray } from 'drizzle-orm';
import { requireEnv } from '../helpers/env.js';

const db = createDb(requireEnv('DATABASE_URL'));

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

  describe('backfillGuildMembers', () => {
    const guildId = 'gm-backfill-guild';
    const userIds = ['gm-backfill-1', 'gm-backfill-2', 'gm-backfill-3'];

    beforeEach(async () => {
      await db.delete(guildMembers).where(and(eq(guildMembers.guildId, guildId), inArray(guildMembers.userId, userIds)));
    });

    it('upserts every member id as inGuild = true and returns the unique count', async () => {
      const count = await backfillGuildMembers(db, guildId, [...userIds, userIds[0]]); // duplicate on purpose
      expect(count).toBe(userIds.length);

      const rows = await db
        .select()
        .from(guildMembers)
        .where(and(eq(guildMembers.guildId, guildId), inArray(guildMembers.userId, userIds)));
      expect(rows).toHaveLength(userIds.length);
      expect(rows.every((r) => r.inGuild)).toBe(true);
    });

    it('flips a previously-departed member back to inGuild = true on re-backfill', async () => {
      await onGuildMemberAdd(db, guildId, userIds[0]);
      await onGuildMemberRemove(db, guildId, userIds[0]);

      await backfillGuildMembers(db, guildId, [userIds[0]]);

      const [row] = await db
        .select()
        .from(guildMembers)
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userIds[0])));
      expect(row.inGuild).toBe(true);
    });

    it('returns 0 and does nothing for an empty member list', async () => {
      const count = await backfillGuildMembers(db, guildId, []);
      expect(count).toBe(0);
    });
  });
});
