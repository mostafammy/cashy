import { describe, it, expect, vi } from 'vitest';
import { shopBuyCommand } from '../../src/commands/shop/buy.js';
import type { ChatInputCommandInteraction, GuildMember, Role } from 'discord.js';

function makeRole(id: string, comparePositionTo = () => -1) {
  return { id, comparePositionTo } as unknown as Role;
}

describe('/shop buy command', () => {
  it('debits the price and assigns the role when the item exists', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = shopBuyCommand(db, redis);

    vi.spyOn(await import('../../src/lib/shop.js'), 'findShopItem').mockResolvedValue({
      id: '1', guildId: 'g1', name: 'VIP Role', price: 500, roleId: 'role-1', description: null,
    });
    const debit = vi.spyOn(await import('../../src/lib/economy.js'), 'debit').mockResolvedValue(undefined);
    const addRole = vi.fn().mockResolvedValue(undefined);

    const role = makeRole('role-1');

    const interaction = {
      guildId: 'g1',
      guild: {
        roles: { cache: new Map([['role-1', role]]) },
        members: { me: { permissions: { has: () => true }, roles: { highest: { comparePositionTo: () => -1 } } } },
      },
      user: { id: 'u1' },
      options: { getString: () => '1' },
      member: { roles: { add: addRole } } as unknown as GuildMember,
      reply: vi.fn(),
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(debit).toHaveBeenCalledWith(db, redis, 'u1', 500, 'shop_purchase', 'g1');
    expect(addRole).toHaveBeenCalledWith('role-1');
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('bought') }),
    );
  });

  it('replies with an error and does not debit when the item does not exist', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = shopBuyCommand(db, redis);

    vi.spyOn(await import('../../src/lib/shop.js'), 'findShopItem').mockResolvedValue(undefined);
    const debit = vi.spyOn(await import('../../src/lib/economy.js'), 'debit').mockResolvedValue(undefined);

    const interaction = {
      guildId: 'g1',
      guild: { roles: { cache: new Map() }, members: { me: null } },
      user: { id: 'u1' },
      options: { getString: () => 'missing' },
      member: { roles: { add: vi.fn() } } as unknown as GuildMember,
      reply: vi.fn(),
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(debit).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('not found') }));
  });

  it('does not debit when the reward role no longer exists in the guild', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = shopBuyCommand(db, redis);

    vi.spyOn(await import('../../src/lib/shop.js'), 'findShopItem').mockResolvedValue({
      id: '1', guildId: 'g1', name: 'VIP Role', price: 500, roleId: 'deleted-role', description: null,
    });
    const debit = vi.spyOn(await import('../../src/lib/economy.js'), 'debit').mockResolvedValue(undefined);

    const interaction = {
      guildId: 'g1',
      guild: { roles: { cache: new Map() }, members: { me: null } },
      user: { id: 'u1' },
      options: { getString: () => '1' },
      member: { roles: { add: vi.fn() } } as unknown as GuildMember,
      reply: vi.fn(),
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(debit).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('no longer exists') }),
    );
  });

  it('refunds the debit when role assignment fails after payment', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = shopBuyCommand(db, redis);

    vi.spyOn(await import('../../src/lib/shop.js'), 'findShopItem').mockResolvedValue({
      id: '1', guildId: 'g1', name: 'VIP Role', price: 500, roleId: 'role-1', description: null,
    });
    const debit = vi.spyOn(await import('../../src/lib/economy.js'), 'debit').mockResolvedValue(undefined);
    const credit = vi.spyOn(await import('../../src/lib/economy.js'), 'credit').mockResolvedValue(undefined);
    const addRole = vi.fn().mockRejectedValue(new Error('Missing Permissions'));

    const role = makeRole('role-1');

    const interaction = {
      guildId: 'g1',
      guild: {
        roles: { cache: new Map([['role-1', role]]) },
        members: { me: { permissions: { has: () => true }, roles: { highest: { comparePositionTo: () => -1 } } } },
      },
      user: { id: 'u1' },
      options: { getString: () => '1' },
      member: { roles: { add: addRole } } as unknown as GuildMember,
      reply: vi.fn(),
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(debit).toHaveBeenCalledWith(db, redis, 'u1', 500, 'shop_purchase', 'g1');
    expect(credit).toHaveBeenCalledWith(db, redis, 'u1', 500, 'shop_purchase', 'g1');
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('refunded') }),
    );
  });
});
