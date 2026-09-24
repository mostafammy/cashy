import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { getBalance } from '../../lib/economy.js';
import { getBotConfig } from '../../lib/config.js';

export function balanceCommand(db: Db, redis: Redis): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('balance')
      .setDescription('Check your or another user\'s universal balance')
      .addUserOption((opt) =>
        opt
          .setName('user')
          .setDescription('The user whose balance you want to check')
          .setRequired(false),
      ),
    async execute(interaction) {
      const targetUser = interaction.options.getUser('user') ?? interaction.user;

      if (targetUser.bot) {
        await interaction.reply({
          content: "Bots don't have a balance.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Neon/Upstash round-trips routinely exceed Discord's ~3s ack deadline,
      // so acknowledge first and edit the deferred reply once the data is in.
      await interaction.deferReply();

      const [balance, config] = await Promise.all([
        getBalance(db, targetUser.id),
        getBotConfig(db, redis),
      ]);

      const isSelf = targetUser.id === interaction.user.id;
      const content = isSelf
        ? `You have ${balance} ${config.currencySymbol} ${config.currencyName}.`
        : `<@${targetUser.id}> has ${balance} ${config.currencySymbol} ${config.currencyName}.`;

      await interaction.editReply({
        content,
      });
    },
  };
}
