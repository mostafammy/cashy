import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../src/db/client.js';
import { shopItems } from '../../src/db/schema.js';
import { listShopItems, findShopItem } from '../../src/lib/shop.js';
import { eq } from 'drizzle-orm';

const db = createDb(process.env.DATABASE_URL ?? 'postgres://cashy:cashy@localhost:5432/cashy');

const guildId = 'shop-test-guild';
let itemId: string;

describe('shop lib', () => {
  beforeEach(async () => {
    await db.delete(shopItems).where(eq(shopItems.guildId, guildId));
    itemId = randomUUID();
    await db.insert(shopItems).values({
      id: itemId,
      guildId,
      name: 'VIP Role',
      price: 500,
      roleId: 'role-1',
      description: 'Grants VIP perks',
    });
  });

  it('listShopItems returns items for the given guild', async () => {
    const items = await listShopItems(db, guildId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: itemId,
      guildId,
      name: 'VIP Role',
      price: 500,
      roleId: 'role-1',
      description: 'Grants VIP perks',
    });
  });

  it('listShopItems returns an empty array for a guild with no items', async () => {
    const items = await listShopItems(db, 'no-such-guild');
    expect(items).toEqual([]);
  });

  it('findShopItem returns the matching item for the guild and id', async () => {
    const item = await findShopItem(db, guildId, itemId);
    expect(item).toMatchObject({
      id: itemId,
      guildId,
      name: 'VIP Role',
      price: 500,
      roleId: 'role-1',
    });
  });

  it('findShopItem returns undefined when the item does not exist', async () => {
    const item = await findShopItem(db, guildId, 'missing-id');
    expect(item).toBeUndefined();
  });

  it('findShopItem returns undefined when the item belongs to a different guild', async () => {
    const item = await findShopItem(db, 'other-guild', itemId);
    expect(item).toBeUndefined();
  });
});
