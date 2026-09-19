import { SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { credit, debit } from '../../lib/economy.js';
import { setBotConfig, type BotConfig } from '../../lib/config.js';
import { isOwner } from '../../lib/permissions.js';

export function ownerCommand(db: Db, redis: Redis, ownerIds: string[]): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('owner')
      .setDescription('Bot-owner-only currency administration')
      .addSubcommand((sub) =>
        sub
          .setName('mint')
          .setDescription('Create currency for a user')
          .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
          .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount to mint').setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('adjust-balance')
          .setDescription('Add or remove currency from a user (negative to remove)')
          .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
          .addIntegerOption((opt) => opt.setName('amount').setDescription('Positive to add, negative to remove').setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('set-config')
          .setDescription('Update the global currency identity')
          .addStringOption((opt) => opt.setName('currency-name').setDescription('New currency name').setRequired(false))
          .addStringOption((opt) => opt.setName('currency-symbol').setDescription('New currency symbol').setRequired(false))
          .addIntegerOption((opt) => opt.setName('daily-amount').setDescription('New /daily amount').setRequired(false)),
      ),
    async execute(interaction) {
      if (!isOwner(ownerIds, interaction.user.id)) {
        await interaction.reply({ content: 'You are not authorized to use this command.', ephemeral: true });
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'mint') {
        const target = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);
        await credit(db, target.id, amount, 'owner_adjust', interaction.guildId ?? null);
        await interaction.reply({ content: `Minted ${amount} for <@${target.id}>.`, ephemeral: true });
        return;
      }

      if (subcommand === 'adjust-balance') {
        const target = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);

        if (amount >= 0) {
          await credit(db, target.id, amount, 'owner_adjust', interaction.guildId ?? null);
        } else {
          await debit(db, target.id, Math.abs(amount), 'owner_adjust', interaction.guildId ?? null);
        }

        await interaction.reply({ content: `Adjusted <@${target.id}> by ${amount}.`, ephemeral: true });
        return;
      }

      // set-config
      const patch: Partial<BotConfig> = {};
      const currencyName = interaction.options.getString('currency-name');
      const currencySymbol = interaction.options.getString('currency-symbol');
      const dailyAmount = interaction.options.getInteger('daily-amount');
      if (currencyName) patch.currencyName = currencyName;
      if (currencySymbol) patch.currencySymbol = currencySymbol;
      if (dailyAmount) patch.dailyAmount = dailyAmount;

      const updated = await setBotConfig(db, redis, patch);
      await interaction.reply({ content: `Config updated: ${JSON.stringify(updated)}`, ephemeral: true });
    },
  };
}
