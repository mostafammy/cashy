import { describe, it, expect } from 'vitest';
import { buildCommands } from '../src/bot.js';

describe('buildCommands', () => {
  it('registers every v1 command exactly once', () => {
    const db = {} as never;
    const redis = {} as never;
    const commands = buildCommands(db, redis, ['owner-1']);
    const names = commands.map((c) => c.data.name).sort();

    expect(names).toEqual(
      [
        'balance',
        'daily',
        'leaderboard',
        'owner',
        'pay',
        'shop-add',
        'shop-buy',
        'shop-remove',
        'shop-view',
        'work',
      ].sort(),
    );
  });
});
