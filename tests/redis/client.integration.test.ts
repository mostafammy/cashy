import { describe, it, expect, afterAll } from 'vitest';
import { createRedis } from '../../src/redis/client.js';
import { requireEnv } from '../helpers/env.js';

const redis = createRedis(requireEnv('REDIS_URL'));

describe('createRedis', () => {
  afterAll(() => redis.quit());

  it('connects and can set/get a key', async () => {
    await redis.set('cashy:test:ping', 'pong');
    const value = await redis.get('cashy:test:ping');
    expect(value).toBe('pong');
    await redis.del('cashy:test:ping');
  });
});
