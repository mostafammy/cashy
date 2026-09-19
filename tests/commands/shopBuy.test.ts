import { describe, it, expect, vi } from 'vitest';
import { shopBuyCommand } from '../../src/commands/shop/buy.js';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';

describe('/shop buy command', () => {
  it('debits the price and assigns the role when the item exists', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = shopBuyCommand(db, redis);

    vi.spyOn(await import('../../src/lib/shop.js'), 'findShopItem').mockResolvedValue({
      id: '1', guildId: 'g1', name: 'VIP Role', price: 500, roleId: 'role-1', description: null,
    });
    const debit = vi.spyOn(await import('../../src/lib/economy.js'), 'debit').mockResolvedValue(undefined);
    const addRole = vi.fn();

    const interaction = {
      guildId: 'g1',
      user: { id: 'u1' },
      options: { getString: () => '1' },
      member: { roles: { add: addRole } } as unknown as GuildMember,
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(debit).toHaveBeenCalledWith(db, 'u1', 500, 'shop_purchase', 'g1');
    expect(addRole).toHaveBeenCalledWith('role-1');
  });

  it('replies with an error and does not debit when the item does not exist', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = shopBuyCommand(db, redis);

    vi.spyOn(await import('../../src/lib/shop.js'), 'findShopItem').mockResolvedValue(undefined);
    const debit = vi.spyOn(await import('../../src/lib/economy.js'), 'debit').mockResolvedValue(undefined);

    const interaction = {
      guildId: 'g1',
      user: { id: 'u1' },
      options: { getString: () => 'missing' },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(debit).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('not found') }));
  });
});
