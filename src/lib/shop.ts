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
