import type { Redis } from '../redis/client.js';

function key(kind: 'daily' | 'work', userId: string): string {
  return `cashy:cooldown:${kind}:${userId}`;
}

export async function getCooldownRemaining(redis: Redis, kind: 'daily' | 'work', userId: string): Promise<number> {
  const ttl = await redis.ttl(key(kind, userId));
  return ttl > 0 ? ttl : 0;
}

export async function setCooldown(redis: Redis, kind: 'daily' | 'work', userId: string, ttlSeconds: number): Promise<void> {
  await redis.set(key(kind, userId), '1', 'EX', ttlSeconds);
}
