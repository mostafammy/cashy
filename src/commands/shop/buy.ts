import { SlashCommandBuilder, type GuildMember } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Redis } from '../../redis/client.js';
import type { Command } from '../types.js';
import { findShopItem } from '../../lib/shop.js';
import { debit } from '../../lib/economy.js';

export function shopBuyCommand(db: Db, _redis: Redis): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('shop-buy')
      .setDescription('Buy an item from this server\'s shop')
      .addStringOption((opt) => opt.setName('item-id').setDescription('The item id from /shop-view').setRequired(true)),
    async execute(interaction) {
      const itemId = interaction.options.getString('item-id', true);
      const item = await findShopItem(db, interaction.guildId!, itemId);

      if (!item) {
        await interaction.reply({ content: 'Item not found in this server\'s shop.', ephemeral: true });
        return;
      }

      await debit(db, interaction.user.id, item.price, 'shop_purchase', interaction.guildId!);
      await (interaction.member as GuildMember).roles.add(item.roleId);

      await interaction.reply({ content: `You bought **${item.name}**!` });
    },
  };
}
