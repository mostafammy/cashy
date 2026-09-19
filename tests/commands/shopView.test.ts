import { describe, it, expect, vi } from 'vitest';
import { shopViewCommand } from '../../src/commands/shop/view.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/shop view command', () => {
  it('lists items for the current guild', async () => {
    const db = { select: vi.fn(), from: vi.fn(), where: vi.fn() } as never;
    const command = shopViewCommand(db);

    const listSpy = vi.spyOn(await import('../../src/lib/shop.js'), 'listShopItems').mockResolvedValue([
      { id: '1', guildId: 'g1', name: 'VIP Role', price: 500, roleId: 'role-1', description: null },
    ]);

    const interaction = {
      guildId: 'g1',
      reply: vi.fn(),
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(listSpy).toHaveBeenCalledWith(db, 'g1');
    const [[payload]] = (interaction.editReply as ReturnType<typeof vi.fn>).mock.calls;
    expect(payload.content).toContain('VIP Role');
    expect(payload.content).toContain('500');
    expect(payload.content).toContain('1');
  });

  it('replies with a fallback message when the shop is empty', async () => {
    const db = {} as never;
    const command = shopViewCommand(db);

    vi.spyOn(await import('../../src/lib/shop.js'), 'listShopItems').mockResolvedValue([]);

    const interaction = {
      guildId: 'g1',
      reply: vi.fn(),
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('no shop items') }),
    );
  });
});
