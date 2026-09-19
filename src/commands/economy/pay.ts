import { SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { transfer } from '../../lib/economy.js';
import { invalidateLeaderboardCache } from '../../lib/leaderboard.js';

export function payCommand(db: Db, redis: Redis): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('pay')
      .setDescription('Send some of your balance to another user')
      .addUserOption((opt) => opt.setName('user').setDescription('Who to pay').setRequired(true))
      .addIntegerOption((opt) => opt.setName('amount').setDescription('How much to send').setRequired(true).setMinValue(1)),
    async execute(interaction) {
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);

      if (target.bot) {
        await interaction.reply({ content: "You can't pay a bot.", ephemeral: true });
        return;
      }

      await transfer(db, interaction.user.id, target.id, amount, interaction.guildId ?? null);
      await invalidateLeaderboardCache(redis, interaction.guildId ?? undefined);
      await invalidateLeaderboardCache(redis);

      await interaction.reply({ content: `Sent ${amount} to <@${target.id}>.` });
    },
  };
}
