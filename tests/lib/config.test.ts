import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { createRedis } from '../../src/redis/client.js';
import { botConfig } from '../../src/db/schema.js';
import { getBotConfig, setBotConfig } from '../../src/lib/config.js';
import { requireEnv } from '../helpers/env.js';

const db = createDb(requireEnv('DATABASE_URL'));
const redis = createRedis(requireEnv('REDIS_URL'));

describe('bot config lib', () => {
  beforeEach(async () => {
    await db.delete(botConfig);
    await redis.del('cashy:bot_config');
  });

  afterAll(() => redis.quit());

  it('returns defaults when no row exists yet', async () => {
    const config = await getBotConfig(db, redis);
    expect(config.currencyName).toBe('Coins');
    expect(config.dailyAmount).toBe(100);
  });

  it('setBotConfig persists changes and getBotConfig reflects them', async () => {
    await setBotConfig(db, redis, { currencyName: 'Shells', dailyAmount: 200 });
    await redis.del('cashy:bot_config');
    const config = await getBotConfig(db, redis);
    expect(config.currencyName).toBe('Shells');
    expect(config.dailyAmount).toBe(200);
  });

  it('getBotConfig serves from cache without hitting the DB on the second call', async () => {
    // Seed a non-default value and populate the cache from it, then delete the
    // underlying row entirely. If getBotConfig fell through to the DB it would
    // find no row and return DEFAULTS ('Coins'/100) instead of the seeded
    // values, so returning the seeded values here proves the cache was used.
    await setBotConfig(db, redis, { currencyName: 'CachedCoin', dailyAmount: 999 });
    await getBotConfig(db, redis); // populate the cache with the seeded value
    await db.delete(botConfig);
    const config = await getBotConfig(db, redis);
    expect(config.currencyName).toBe('CachedCoin');
    expect(config.dailyAmount).toBe(999);
  });
});
