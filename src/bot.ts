import { Client, GatewayIntentBits, Events } from 'discord.js';
import type { Db } from './db/client.js';
import type { Redis } from './redis/client.js';
import type { Command } from './commands/types.js';
import { createRegistry } from './commands/registry.js';
import { balanceCommand } from './commands/economy/balance.js';
import { leaderboardCommand } from './commands/economy/leaderboard.js';
import { dailyCommand } from './commands/economy/daily.js';
import { workCommand } from './commands/economy/work.js';
import { payCommand } from './commands/economy/pay.js';
import { shopViewCommand } from './commands/shop/view.js';
import { shopBuyCommand } from './commands/shop/buy.js';
import { shopAddCommand, shopRemoveCommand } from './commands/shop/admin.js';
import { ownerCommand } from './commands/owner/owner.js';
import { onGuildMemberAdd, onGuildMemberRemove } from './events/guildMember.js';

export function buildCommands(db: Db, redis: Redis, ownerIds: string[]): Command[] {
  return [
    balanceCommand(db, redis),
    leaderboardCommand(db, redis),
    dailyCommand(db, redis),
    workCommand(db, redis),
    payCommand(db, redis),
    shopViewCommand(db),
    shopBuyCommand(db, redis),
    shopAddCommand(db),
    shopRemoveCommand(db),
    ownerCommand(db, redis, ownerIds),
  ];
}

export function createBot(db: Db, redis: Redis, ownerIds: string[]) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  const registry = createRegistry();
  for (const command of buildCommands(db, redis, ownerIds)) {
    registry.register(command);
  }

  client.once(Events.ClientReady, (c) => {
    console.log(`Logged in as ${c.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    await registry.handleInteraction(interaction);
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    await onGuildMemberAdd(db, member.guild.id, member.id);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    await onGuildMemberRemove(db, member.guild.id, member.id);
  });

  return client;
}
