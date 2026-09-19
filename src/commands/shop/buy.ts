import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type GuildMember } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { findShopItem } from '../../lib/shop.js';
import { credit, debit } from '../../lib/economy.js';

export function shopBuyCommand(db: Db, redis: Redis): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('shop-buy')
      .setDescription('Buy an item from this server\'s shop')
      .addStringOption((opt) => opt.setName('item-id').setDescription('The item id from /shop-view').setRequired(true)),
    async execute(interaction) {
      if (!interaction.guildId || !interaction.guild) {
        await interaction.reply({
          content: 'This command only works in a server.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const member = interaction.member as GuildMember | null;
      if (!member || typeof member.roles?.add !== 'function') {
        await interaction.reply({
          content: "Couldn't resolve your server membership — try again in a moment.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply();

      const itemId = interaction.options.getString('item-id', true);
      const item = await findShopItem(db, interaction.guildId, itemId);

      if (!item) {
        await interaction.editReply({ content: 'Item not found in this server\'s shop.' });
        return;
      }

      // Verify the reward role is actually grantable BEFORE taking any money.
      // The likeliest failure is a deleted role, followed by the role sitting
      // above the bot's highest role or the bot lacking Manage Roles.
      const role = interaction.guild.roles.cache.get(item.roleId);
      if (!role) {
        await interaction.editReply({
          content: `**${item.name}** can't be bought right now: its reward role no longer exists. Ask a server admin to fix the shop entry. You have not been charged.`,
        });
        return;
      }

      const me = interaction.guild.members.me;
      if (me) {
        const canManageRoles = me.permissions?.has?.(PermissionFlagsBits.ManageRoles) ?? true;
        const roleIsBelowBot = me.roles?.highest ? role.comparePositionTo(me.roles.highest) < 0 : true;
        if (!canManageRoles || !roleIsBelowBot) {
          await interaction.editReply({
            content: `**${item.name}** can't be bought right now: I can't assign <@&${item.roleId}>. Ask a server admin to give me Manage Roles and move my role above it. You have not been charged.`,
          });
          return;
        }
      }

      await debit(db, redis, interaction.user.id, item.price, 'shop_purchase', interaction.guildId);

      try {
        await member.roles.add(item.roleId);
      } catch (error) {
        console.error(`Role add failed after debit for user ${interaction.user.id}, item ${item.id}:`, error);
        // Refund rather than leave the buyer out the currency with no role.
        await credit(db, redis, interaction.user.id, item.price, 'shop_purchase', interaction.guildId);
        await interaction.editReply({
          content: `I couldn't assign <@&${item.roleId}>, so your ${item.price} has been refunded. Ask a server admin to check my permissions.`,
        });
        return;
      }

      await interaction.editReply({ content: `You bought **${item.name}**!` });
    },
  };
}
