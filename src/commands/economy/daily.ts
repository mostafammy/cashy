import { SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command, CommandInvocation } from '../types.js';
import { credit } from '../../lib/economy.js';
import { getCooldownRemaining, setCooldown } from '../../lib/cooldowns.js';
import { getBotConfig } from '../../lib/config.js';
import { OnCooldownError } from '../../errors.js';

const DAY_SECONDS = 86400;

export function dailyCommand(db: Db, redis: Redis): Command {
  return {
    data: new SlashCommandBuilder().setName('daily').setDescription('Claim your daily reward'),
    aliases: ['d'],
    async execute(interaction: CommandInvocation) {
      await interaction.deferReply();

      const remaining = await getCooldownRemaining(redis, 'daily', interaction.user.id);
      if (remaining > 0) {
        throw new OnCooldownError(remaining);
      }

      const config = await getBotConfig(db, redis);
      await credit(db, redis, interaction.user.id, config.dailyAmount, 'daily', interaction.guildId ?? null);
      await setCooldown(redis, 'daily', interaction.user.id, DAY_SECONDS);

      await interaction.editReply({
        content: `You claimed your daily ${config.dailyAmount} ${config.currencySymbol} ${config.currencyName}!`,
      });
    },
  };
}
