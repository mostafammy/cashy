import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Command } from '../types.js';
import { insertShopItem, deleteShopItem } from '../../lib/shop.js';

export function shopAddCommand(db: Db): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('shop-add')
      .setDescription('Add an item to this server\'s shop')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((opt) => opt.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption((opt) => opt.setName('price').setDescription('Price').setRequired(true).setMinValue(1))
      .addRoleOption((opt) => opt.setName('role').setDescription('Role to grant').setRequired(true))
      .addStringOption((opt) => opt.setName('description').setDescription('Item description').setRequired(false)),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({
          content: 'This command only works in a server.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const name = interaction.options.getString('name', true);
      const price = interaction.options.getInteger('price', true);
      const role = interaction.options.getRole('role', true);
      const description = interaction.options.getString('description');

      await interaction.deferReply();

      const item = await insertShopItem(db, {
        guildId: interaction.guildId,
        name,
        price,
        roleId: role.id,
        description,
      });

      // Echo the generated id — it is the handle /shop-buy and /shop-remove need.
      await interaction.editReply({
        content: `Added **${item.name}** for ${item.price} (id: \`${item.id}\`).`,
      });
    },
  };
}

export function shopRemoveCommand(db: Db): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('shop-remove')
      .setDescription('Remove an item from this server\'s shop')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((opt) => opt.setName('item-id').setDescription('The item id from /shop-view').setRequired(true)),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({
          content: 'This command only works in a server.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const itemId = interaction.options.getString('item-id', true);

      await interaction.deferReply();

      await deleteShopItem(db, interaction.guildId, itemId);
      await interaction.editReply({ content: 'Item removed.' });
    },
  };
}
