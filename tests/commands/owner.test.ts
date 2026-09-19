import { describe, it, expect, vi } from 'vitest';
import { ownerCommand } from '../../src/commands/owner/owner.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/owner command', () => {
  it('rejects a non-owner user before touching the database', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = ownerCommand(db, redis, ['owner-1']);

    const credit = vi.spyOn(await import('../../src/lib/economy.js'), 'credit').mockResolvedValue(undefined);

    const interaction = {
      user: { id: 'not-owner' },
      options: {
        getSubcommand: () => 'mint',
        getUser: () => ({ id: 'target' }),
        getInteger: () => 1000,
      },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(credit).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('not authorized'), ephemeral: true }),
    );
  });

  it('mint credits the target user when called by an owner', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = ownerCommand(db, redis, ['owner-1']);

    const credit = vi.spyOn(await import('../../src/lib/economy.js'), 'credit').mockResolvedValue(undefined);

    const interaction = {
      user: { id: 'owner-1' },
      guildId: null,
      options: {
        getSubcommand: () => 'mint',
        getUser: () => ({ id: 'target' }),
        getInteger: () => 1000,
      },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(credit).toHaveBeenCalledWith(db, 'target', 1000, 'owner_adjust', null);
  });

  it('adjust-balance debits when the amount is negative', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = ownerCommand(db, redis, ['owner-1']);

    const debit = vi.spyOn(await import('../../src/lib/economy.js'), 'debit').mockResolvedValue(undefined);

    const interaction = {
      user: { id: 'owner-1' },
      guildId: null,
      options: {
        getSubcommand: () => 'adjust-balance',
        getUser: () => ({ id: 'target' }),
        getInteger: () => -200,
      },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(debit).toHaveBeenCalledWith(db, 'target', 200, 'owner_adjust', null);
  });

  it('set-config updates currency name via setBotConfig', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = ownerCommand(db, redis, ['owner-1']);

    const setConfig = vi.spyOn(await import('../../src/lib/config.js'), 'setBotConfig').mockResolvedValue({
      currencyName: 'Shells', currencySymbol: '🐚', dailyAmount: 100, workMin: 20, workMax: 80,
    });

    const interaction = {
      user: { id: 'owner-1' },
      options: {
        getSubcommand: () => 'set-config',
        getString: (name: string) => (name === 'currency-name' ? 'Shells' : null),
        getInteger: () => null,
      },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(setConfig).toHaveBeenCalledWith(db, redis, expect.objectContaining({ currencyName: 'Shells' }));
  });
});
