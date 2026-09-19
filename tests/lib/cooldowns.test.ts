import { describe, it, expect, afterEach } from 'vitest';
import { createRedis } from '../../src/redis/client.js';
import { getCooldownRemaining, setCooldown } from '../../src/lib/cooldowns.js';
import { requireEnv } from '../helpers/env.js';

const redis = createRedis(requireEnv('REDIS_URL'));

describe('cooldowns lib', () => {
  afterEach(async () => {
    await redis.del('cashy:cooldown:daily:user-1');
  });

  it('returns 0 when no cooldown is set', async () => {
    expect(await getCooldownRemaining(redis, 'daily', 'user-1')).toBe(0);
  });

  it('returns a positive remaining time after setCooldown', async () => {
    await setCooldown(redis, 'daily', 'user-1', 60);
    const remaining = await getCooldownRemaining(redis, 'daily', 'user-1');
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(60);
  });

  it('cooldown key has no guild segment (global per user)', async () => {
    await setCooldown(redis, 'work', 'user-1', 30);
    const keys = await redis.keys('cashy:cooldown:work:user-1');
    expect(keys).toEqual(['cashy:cooldown:work:user-1']);
    await redis.del('cashy:cooldown:work:user-1');
  });
});
