import { describe, it, expect, vi } from 'vitest';
import { leaderboardCommand } from '../../src/commands/economy/leaderboard.js';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('/leaderboard command', () => {
  it('shows the guild leaderboard by default', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = leaderboardCommand(db, redis);

    vi.spyOn(await import('../../src/lib/leaderboard.js'), 'getGuildLeaderboard').mockResolvedValue([
      { userId: 'a', balance: 300 },
      { userId: 'b', balance: 100 },
    ]);

    const interaction = {
      guildId: 'guild-1',
      options: { getSubcommand: () => 'guild' },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    const [[payload]] = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls;
    expect(payload.content).toContain('a');
    expect(payload.content).toContain('300');
  });

  it('shows the global leaderboard for the "global" subcommand', async () => {
    const db = {} as never;
    const redis = {} as never;
    const command = leaderboardCommand(db, redis);

    vi.spyOn(await import('../../src/lib/leaderboard.js'), 'getGlobalLeaderboard').mockResolvedValue([
      { userId: 'c', balance: 900 },
    ]);

    const interaction = {
      guildId: 'guild-1',
      options: { getSubcommand: () => 'global' },
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await command.execute(interaction);

    const [[payload]] = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls;
    expect(payload.content).toContain('c');
    expect(payload.content).toContain('900');
  });
});
