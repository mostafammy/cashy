import { describe, it, expect, vi, beforeEach } from 'vitest';
import { balanceCommand } from '../../src/commands/economy/balance.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/balance command', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("replies with the caller's balance formatted with the currency symbol when no target is provided", async () => {
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
      user: { id: 'u1', bot: false },
      options: {
        getUser: vi.fn().mockReturnValue(null),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'You have 250 🪙 Coins.' }),
    );
  });

  it("replies with the target user's balance when a user option is provided", async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = balanceCommand(db, redis);

    const getBalanceSpy = vi.spyOn(await import('../../src/lib/economy.js'), 'getBalance').mockResolvedValue(500);
    vi.spyOn(await import('../../src/lib/config.js'), 'getBotConfig').mockResolvedValue({
      currencyName: 'Coins',
      currencySymbol: '🪙',
      dailyAmount: 100,
      workMin: 20,
      workMax: 80,
    });

    const interaction = {
      user: { id: 'u1', bot: false },
      options: {
        getUser: vi.fn().mockReturnValue({ id: 'u2', bot: false }),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(getBalanceSpy).toHaveBeenCalledWith(db, 'u2');
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: '<@u2> has 500 🪙 Coins.' }),
    );
  });

  it("formats as 'You have' when the target user is the caller", async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = balanceCommand(db, redis);

    vi.spyOn(await import('../../src/lib/economy.js'), 'getBalance').mockResolvedValue(300);
    vi.spyOn(await import('../../src/lib/config.js'), 'getBotConfig').mockResolvedValue({
      currencyName: 'Coins',
      currencySymbol: '🪙',
      dailyAmount: 100,
      workMin: 20,
      workMax: 80,
    });

    const interaction = {
      user: { id: 'u1', bot: false },
      options: {
        getUser: vi.fn().mockReturnValue({ id: 'u1', bot: false }),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'You have 300 🪙 Coins.' }),
    );
  });

  it('rejects bot users with an ephemeral message without deferring', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = balanceCommand(db, redis);

    const interaction = {
      user: { id: 'u1', bot: false },
      options: {
        getUser: vi.fn().mockReturnValue({ id: 'bot-123', bot: true }),
      },
      reply: vi.fn(),
      deferReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Bots don't have a balance." }),
    );
  });
});
