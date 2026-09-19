import { describe, it, expect, afterAll } from 'vitest';
import { createRedis } from '../../src/redis/client.js';

const redis = createRedis(process.env.REDIS_URL ?? 'redis://localhost:6379');

describe('createRedis', () => {
  afterAll(() => redis.quit());

  it('connects and can set/get a key', async () => {
    await redis.set('cashy:test:ping', 'pong');
    const value = await redis.get('cashy:test:ping');
    expect(value).toBe('pong');
    await redis.del('cashy:test:ping');
  });
});
