import { SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { getBalance } from '../../lib/economy.js';
import { getBotConfig } from '../../lib/config.js';

export function balanceCommand(db: Db, redis: Redis): Command {
  return {
    data: new SlashCommandBuilder().setName('balance').setDescription('Check your universal balance'),
    async execute(interaction) {
      const [balance, config] = await Promise.all([
        getBalance(db, interaction.user.id),
        getBotConfig(db, redis),
      ]);

      await interaction.reply({
        content: `You have ${balance} ${config.currencySymbol} ${config.currencyName}.`,
      });
    },
  };
}
