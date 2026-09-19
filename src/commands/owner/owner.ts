import { MessageFlags, SlashCommandBuilder } from 'discord.js';
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
          .setDescription('Update the global currency identity and economy amounts')
          .addStringOption((opt) => opt.setName('currency-name').setDescription('New currency name').setRequired(false))
          .addStringOption((opt) => opt.setName('currency-symbol').setDescription('New currency symbol').setRequired(false))
          .addIntegerOption((opt) => opt.setName('daily-amount').setDescription('New /daily amount').setRequired(false))
          .addIntegerOption((opt) => opt.setName('work-min').setDescription('New minimum /work payout').setRequired(false))
          .addIntegerOption((opt) => opt.setName('work-max').setDescription('New maximum /work payout').setRequired(false)),
      ),
    async execute(interaction) {
      if (!isOwner(ownerIds, interaction.user.id)) {
        await interaction.reply({
          content: 'You are not authorized to use this command.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Every reply below is owner-only, so defer ephemerally.
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'mint') {
        const target = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);
        await credit(db, redis, target.id, amount, 'owner_adjust', interaction.guildId ?? null);
        await interaction.editReply({ content: `Minted ${amount} for <@${target.id}>.` });
        return;
      }

      if (subcommand === 'adjust-balance') {
        const target = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);

        if (amount >= 0) {
          await credit(db, redis, target.id, amount, 'owner_adjust', interaction.guildId ?? null);
        } else {
          await debit(db, redis, target.id, Math.abs(amount), 'owner_adjust', interaction.guildId ?? null);
        }

        await interaction.editReply({ content: `Adjusted <@${target.id}> by ${amount}.` });
        return;
      }

      // set-config. getString/getInteger return null when an option was not
      // supplied, so `!== null` is the correct "was this given" test — a
      // truthiness check would silently drop a deliberate 0 or empty string.
      const patch: Partial<BotConfig> = {};
      const currencyName = interaction.options.getString('currency-name');
      const currencySymbol = interaction.options.getString('currency-symbol');
      const dailyAmount = interaction.options.getInteger('daily-amount');
      const workMin = interaction.options.getInteger('work-min');
      const workMax = interaction.options.getInteger('work-max');
      if (currencyName !== null) patch.currencyName = currencyName;
      if (currencySymbol !== null) patch.currencySymbol = currencySymbol;
      if (dailyAmount !== null) patch.dailyAmount = dailyAmount;
      if (workMin !== null) patch.workMin = workMin;
      if (workMax !== null) patch.workMax = workMax;

      const updated = await setBotConfig(db, redis, patch);
      await interaction.editReply({ content: `Config updated: ${JSON.stringify(updated)}` });
    },
  };
}
