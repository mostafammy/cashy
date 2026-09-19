import { describe, it, expect, vi } from 'vitest';
import { payCommand } from '../../src/commands/economy/pay.js';
import { InsufficientBalanceError } from '../../src/errors.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/pay command', () => {
  it('transfers the amount and replies with confirmation', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = payCommand(db, redis);

    const transfer = vi.spyOn(await import('../../src/lib/economy.js'), 'transfer').mockResolvedValue(undefined);
    vi.spyOn(await import('../../src/lib/leaderboard.js'), 'invalidateLeaderboardCache').mockResolvedValue(undefined);

    const interaction = {
      user: { id: 'sender' },
      guildId: 'g1',
      options: {
        getUser: () => ({ id: 'recipient', bot: false }),
        getInteger: () => 50,
      },
      reply: vi.fn(),
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(transfer).toHaveBeenCalledWith(db, redis, 'sender', 'recipient', 50, 'g1');
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('50') }));
  });

  it('rejects paying a bot user without calling transfer', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = payCommand(db, redis);

    const transfer = vi.spyOn(await import('../../src/lib/economy.js'), 'transfer').mockResolvedValue(undefined);

    const interaction = {
      user: { id: 'sender' },
      guildId: 'g1',
      options: {
        getUser: () => ({ id: 'bot-1', bot: true }),
        getInteger: () => 50,
      },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(transfer).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('bot') }));
  });

  it('propagates InsufficientBalanceError from transfer', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = payCommand(db, redis);

    vi.spyOn(await import('../../src/lib/economy.js'), 'transfer').mockRejectedValue(
      new InsufficientBalanceError('sender', 50, 10),
    );

    const interaction = {
      user: { id: 'sender' },
      guildId: 'g1',
      options: {
        getUser: () => ({ id: 'recipient', bot: false }),
        getInteger: () => 50,
      },
      reply: vi.fn(),
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await expect(command.execute(interaction)).rejects.toThrow(InsufficientBalanceError);
  });
});
