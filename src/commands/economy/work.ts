import { SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { credit } from '../../lib/economy.js';
import { getCooldownRemaining, setCooldown } from '../../lib/cooldowns.js';
import { getBotConfig } from '../../lib/config.js';
import { OnCooldownError } from '../../errors.js';

const HOUR_SECONDS = 3600;

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function workCommand(db: Db, redis: Redis): Command {
  return {
    data: new SlashCommandBuilder().setName('work').setDescription('Work for a random reward'),
    async execute(interaction) {
      const remaining = await getCooldownRemaining(redis, 'work', interaction.user.id);
      if (remaining > 0) {
        throw new OnCooldownError(remaining);
      }

      const config = await getBotConfig(db, redis);
      const amount = randomInRange(config.workMin, config.workMax);
      await credit(db, interaction.user.id, amount, 'work', interaction.guildId ?? null);
      await setCooldown(redis, 'work', interaction.user.id, HOUR_SECONDS);

      await interaction.reply({
        content: `You worked and earned ${amount} ${config.currencySymbol} ${config.currencyName}!`,
      });
    },
  };
}
