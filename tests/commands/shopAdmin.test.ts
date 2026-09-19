import { describe, it, expect, vi } from 'vitest';
import { shopAddCommand, shopRemoveCommand } from '../../src/commands/shop/admin.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/shop-add and /shop-remove commands', () => {
  it('shop-add declares ManageGuild as the default member permission', () => {
    const command = shopAddCommand({} as never);
    expect(command.data.toJSON().default_member_permissions).toBeDefined();
  });

  it('shop-add inserts a new shop item scoped to the interaction guild', async () => {
    const db = {} as never;
    const command = shopAddCommand(db);

    const insertValues = vi.fn().mockResolvedValue({
      id: 'item-1',
      guildId: 'g1',
      name: 'VIP Role',
      price: 500,
      roleId: 'role-1',
      description: 'desc',
    });
    vi.spyOn(await import('../../src/lib/shop.js'), 'insertShopItem').mockImplementation(insertValues);

    const interaction = {
      guildId: 'g1',
      options: {
        getString: (name: string) => (name === 'name' ? 'VIP Role' : 'desc'),
        getInteger: () => 500,
        getRole: () => ({ id: 'role-1' }),
      },
      reply: vi.fn(),
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(insertValues).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ guildId: 'g1', name: 'VIP Role', price: 500, roleId: 'role-1' }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('item-1') }),
    );
  });

  it('shop-remove deletes an item scoped to the interaction guild', async () => {
    const db = {} as never;
    const command = shopRemoveCommand(db);

    const deleteItem = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(await import('../../src/lib/shop.js'), 'deleteShopItem').mockImplementation(deleteItem);

    const interaction = {
      guildId: 'g1',
      options: { getString: () => 'item-1' },
      reply: vi.fn(),
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(deleteItem).toHaveBeenCalledWith(db, 'g1', 'item-1');
  });
});
