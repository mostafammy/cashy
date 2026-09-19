import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/env.js';

describe('loadEnv', () => {
  it('parses required vars and splits OWNER_IDS on commas', () => {
    const env = loadEnv({
      DISCORD_TOKEN: 'token123',
      DATABASE_URL: 'postgres://x',
      REDIS_URL: 'redis://x',
      OWNER_IDS: '111,222 ,333',
    } as NodeJS.ProcessEnv);

    expect(env).toEqual({
      discordToken: 'token123',
      databaseUrl: 'postgres://x',
      redisUrl: 'redis://x',
      ownerIds: ['111', '222', '333'],
    });
  });

  it('throws when a required var is missing', () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow(/DISCORD_TOKEN/);
  });
});
