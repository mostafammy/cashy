import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../src/db/client.js';
import { shopItems } from '../../src/db/schema.js';
import { listShopItems, findShopItem, insertShopItem, deleteShopItem } from '../../src/lib/shop.js';
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

  it('insertShopItem creates a new item that becomes queryable via listShopItems/findShopItem', async () => {
    await insertShopItem(db, {
      guildId,
      name: 'Custom Color',
      price: 250,
      roleId: 'role-2',
      description: 'A custom color role',
    });

    const items = await listShopItems(db, guildId);
    expect(items).toHaveLength(2);

    const inserted = items.find((i) => i.name === 'Custom Color');
    expect(inserted).toMatchObject({
      guildId,
      name: 'Custom Color',
      price: 250,
      roleId: 'role-2',
      description: 'A custom color role',
    });

    const found = await findShopItem(db, guildId, inserted!.id);
    expect(found).toMatchObject({ name: 'Custom Color', price: 250, roleId: 'role-2' });
  });

  it('deleteShopItem removes the item so it is no longer queryable', async () => {
    await deleteShopItem(db, guildId, itemId);

    const found = await findShopItem(db, guildId, itemId);
    expect(found).toBeUndefined();

    const items = await listShopItems(db, guildId);
    expect(items).toEqual([]);
  });

  it('deleteShopItem does not delete items belonging to a different guild', async () => {
    await deleteShopItem(db, 'other-guild', itemId);

    const found = await findShopItem(db, guildId, itemId);
    expect(found).toMatchObject({ id: itemId, guildId });
  });
});
