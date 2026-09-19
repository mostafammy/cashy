import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { transfer } from '../../lib/economy.js';

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

      // Option-only validation, no I/O — safe to answer inside the 3s window
      // and keeps this rejection ephemeral (a deferred public reply could not
      // be downgraded to ephemeral afterwards).
      if (target.bot) {
        await interaction.reply({ content: "You can't pay a bot.", flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply();

      // transfer() invalidates the guild + global leaderboard caches itself.
      await transfer(db, redis, interaction.user.id, target.id, amount, interaction.guildId ?? null);

      await interaction.editReply({ content: `Sent ${amount} to <@${target.id}>.` });
    },
  };
}
