import { describe, it, expect, vi } from 'vitest';
import { balanceCommand } from '../../src/commands/economy/balance.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/balance command', () => {
  it('replies with the caller\'s balance formatted with the currency symbol', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = balanceCommand(db, redis);

    vi.spyOn(await import('../../src/lib/economy.js'), 'getBalance').mockResolvedValue(250);
    vi.spyOn(await import('../../src/lib/config.js'), 'getBotConfig').mockResolvedValue({
      currencyName: 'Coins',
      currencySymbol: '🪙',
      dailyAmount: 100,
      workMin: 20,
      workMax: 80,
    });

    const interaction = {
      user: { id: 'u1' },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('250') }),
    );
  });
});
