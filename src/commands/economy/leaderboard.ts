import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { getGuildLeaderboard, getGlobalLeaderboard, type LeaderboardEntry } from '../../lib/leaderboard.js';

function formatBoard(entries: LeaderboardEntry[]): string {
  return entries.map((e, i) => `${i + 1}. <@${e.userId}> — ${e.balance}`).join('\n') || 'No one has a balance yet.';
}

export function leaderboardCommand(db: Db, redis: Redis): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Show top balances')
      .addSubcommand((sub) => sub.setName('guild').setDescription('Top balances in this server'))
      .addSubcommand((sub) => sub.setName('global').setDescription('Top balances across every server')),
    async execute(interaction) {
      const subcommand = interaction.options.getSubcommand();

      // Slash commands are DM-invocable by default, so `guildId` is null in a
      // DM. Bail out before deferring (no I/O yet) so the rejection can stay
      // ephemeral, and so a guild-scoped read never runs without a guild.
      // `/leaderboard global` stays usable in DMs.
      if (subcommand !== 'global' && !interaction.guildId) {
        await interaction.reply({
          content: 'This command only works in a server.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply();

      const entries =
        subcommand === 'global'
          ? await getGlobalLeaderboard(db, redis)
          : await getGuildLeaderboard(db, redis, interaction.guildId!);

      await interaction.editReply({ content: formatBoard(entries) });
    },
  };
}
