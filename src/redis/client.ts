import { Redis } from 'ioredis';

export function createRedis(redisUrl: string): Redis {
  return new Redis(redisUrl);
}

export type { Redis };
