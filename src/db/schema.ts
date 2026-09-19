import { pgTable, text, integer, bigint, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  userId: text('user_id').primaryKey(),
  balance: bigint('balance', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  counterpartyUserId: text('counterparty_user_id'),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  type: text('type').$type<'daily' | 'work' | 'pay' | 'shop_purchase' | 'owner_adjust'>().notNull(),
  guildId: text('guild_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const shopItems = pgTable('shop_items', {
  id: text('id').primaryKey(),
  guildId: text('guild_id').notNull(),
  name: text('name').notNull(),
  price: bigint('price', { mode: 'number' }).notNull(),
  roleId: text('role_id').notNull(),
  description: text('description'),
});

export const botConfig = pgTable('bot_config', {
  id: integer('id').primaryKey().default(1),
  currencyName: text('currency_name').notNull().default('Coins'),
  currencySymbol: text('currency_symbol').notNull().default('🪙'),
  dailyAmount: bigint('daily_amount', { mode: 'number' }).notNull().default(100),
  workMin: bigint('work_min', { mode: 'number' }).notNull().default(20),
  workMax: bigint('work_max', { mode: 'number' }).notNull().default(80),
});

export const guildConfig = pgTable('guild_config', {
  guildId: text('guild_id').primaryKey(),
  shopChannelId: text('shop_channel_id'),
});

export const guildMembers = pgTable('guild_members', {
  guildId: text('guild_id').notNull(),
  userId: text('user_id').notNull(),
  inGuild: boolean('in_guild').notNull().default(true),
});
