import type { Db } from '../db/client.js';
import type { Redis } from '../redis/client.js';
import { botConfig } from '../db/schema.js';

export interface BotConfig {
  currencyName: string;
  currencySymbol: string;
  dailyAmount: number;
  workMin: number;
  workMax: number;
}

const CACHE_KEY = 'cashy:bot_config';
const CACHE_TTL_SECONDS = 60;

const DEFAULTS: BotConfig = {
  currencyName: 'Coins',
  currencySymbol: '🪙',
  dailyAmount: 100,
  workMin: 20,
  workMax: 80,
};

export async function getBotConfig(db: Db, redis: Redis): Promise<BotConfig> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as BotConfig;

  const [row] = await db.select().from(botConfig);
  const config: BotConfig = row
    ? {
        currencyName: row.currencyName,
        currencySymbol: row.currencySymbol,
        dailyAmount: row.dailyAmount,
        workMin: row.workMin,
        workMax: row.workMax,
      }
    : DEFAULTS;

  await redis.set(CACHE_KEY, JSON.stringify(config), 'EX', CACHE_TTL_SECONDS);
  return config;
}

export async function setBotConfig(db: Db, redis: Redis, patch: Partial<BotConfig>): Promise<BotConfig> {
  const current = await getBotConfig(db, redis);
  const next = { ...current, ...patch };

  await db
    .insert(botConfig)
    .values({ id: 1, ...next })
    .onConflictDoUpdate({ target: botConfig.id, set: next });

  await redis.del(CACHE_KEY);
  return next;
}
