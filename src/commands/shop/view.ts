import { SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Command } from '../types.js';
import { listShopItems } from '../../lib/shop.js';

export function shopViewCommand(db: Db): Command {
  return {
    data: new SlashCommandBuilder().setName('shop-view').setDescription('View this server\'s shop'),
    async execute(interaction) {
      const items = await listShopItems(db, interaction.guildId!);
      const content = items.length
        ? items.map((i) => `**${i.name}** — ${i.price} — <@&${i.roleId}>${i.description ? `\n${i.description}` : ''}`).join('\n\n')
        : 'This server has no shop items yet.';

      await interaction.reply({ content });
    },
  };
}
