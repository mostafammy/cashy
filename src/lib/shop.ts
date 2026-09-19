import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { shopItems } from '../db/schema.js';

export interface ShopItem {
  id: string;
  guildId: string;
  name: string;
  price: number;
  roleId: string;
  description: string | null;
}

export async function listShopItems(db: Db, guildId: string): Promise<ShopItem[]> {
  return db.select().from(shopItems).where(eq(shopItems.guildId, guildId));
}

export async function findShopItem(db: Db, guildId: string, itemId: string): Promise<ShopItem | undefined> {
  const [item] = await db
    .select()
    .from(shopItems)
    .where(and(eq(shopItems.guildId, guildId), eq(shopItems.id, itemId)));
  return item;
}

/**
 * Insert a shop item and return the created row (including its generated id),
 * so callers can echo the id back to the admin — `/shop-buy` and `/shop-remove`
 * both take an `item-id`, which is otherwise never surfaced to anyone.
 */
export async function insertShopItem(
  db: Db,
  item: { guildId: string; name: string; price: number; roleId: string; description: string | null },
): Promise<ShopItem> {
  const row = { id: randomUUID(), ...item };
  await db.insert(shopItems).values(row);
  return row;
}

export async function deleteShopItem(db: Db, guildId: string, itemId: string): Promise<void> {
  await db.delete(shopItems).where(and(eq(shopItems.guildId, guildId), eq(shopItems.id, itemId)));
}
