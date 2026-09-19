import { describe, it, expect, vi } from 'vitest';
import { workCommand } from '../../src/commands/economy/work.js';
import { OnCooldownError } from '../../src/errors.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/work command', () => {
  it('credits an amount within [workMin, workMax] and sets a 1h cooldown', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = workCommand(db, redis);

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

    expect(setCooldown).toHaveBeenCalledWith(redis, 'work', 'u1', 3600);
    const [, , , amount] = credit.mock.calls[0];
    expect(amount).toBeGreaterThanOrEqual(20);
    expect(amount).toBeLessThanOrEqual(80);
  });

  it('throws OnCooldownError when already worked this hour', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = workCommand(db, redis);

    vi.spyOn(await import('../../src/lib/cooldowns.js'), 'getCooldownRemaining').mockResolvedValue(120);

    const interaction = {
      user: { id: 'u1' },
      guildId: 'g1',
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await expect(command.execute(interaction)).rejects.toThrow(OnCooldownError);
  });
});
