import { describe, it, expect, vi } from 'vitest';
import { dailyCommand } from '../../src/commands/economy/daily.js';
import { OnCooldownError } from '../../src/errors.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/daily command', () => {
  it('credits the daily amount and sets a 24h cooldown when not on cooldown', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = dailyCommand(db, redis);

    vi.spyOn(await import('../../src/lib/cooldowns.js'), 'getCooldownRemaining').mockResolvedValue(0);
    const setCooldown = vi.spyOn(await import('../../src/lib/cooldowns.js'), 'setCooldown').mockResolvedValue(undefined);
    const credit = vi.spyOn(await import('../../src/lib/economy.js'), 'credit').mockResolvedValue(undefined);
    vi.spyOn(await import('../../src/lib/config.js'), 'getBotConfig').mockResolvedValue({
      currencyName: 'Coins', currencySymbol: '🪙', dailyAmount: 100, workMin: 20, workMax: 80,
    });

    const interaction = {
      user: { id: 'u1' },
      guildId: 'g1',
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(credit).toHaveBeenCalledWith(db, redis, 'u1', 100, 'daily', 'g1');
    expect(setCooldown).toHaveBeenCalledWith(redis, 'daily', 'u1', 86400);
  });

  it('throws OnCooldownError when already claimed today', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = dailyCommand(db, redis);

    vi.spyOn(await import('../../src/lib/cooldowns.js'), 'getCooldownRemaining').mockResolvedValue(3600);

    const interaction = {
      user: { id: 'u1' },
      guildId: 'g1',
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await expect(command.execute(interaction)).rejects.toThrow(OnCooldownError);
  });
});
