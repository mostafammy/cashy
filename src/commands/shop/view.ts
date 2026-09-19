import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Db } from '../../db/client.js';
import type { Command } from '../types.js';
import { listShopItems } from '../../lib/shop.js';

export function shopViewCommand(db: Db): Command {
  return {
    data: new SlashCommandBuilder().setName('shop-view').setDescription('View this server\'s shop'),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({
          content: 'This command only works in a server.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply();

      const items = await listShopItems(db, interaction.guildId);
      // The id must be shown: /shop-buy and /shop-remove both take an item-id,
      // and this listing is the only place a user can learn it.
      const content = items.length
        ? items
            .map(
              (i) =>
                `**${i.name}** (id: \`${i.id}\`) — ${i.price} — <@&${i.roleId}>${i.description ? `\n${i.description}` : ''}`,
            )
            .join('\n\n')
        : 'This server has no shop items yet.';

      await interaction.editReply({ content });
    },
  };
}
