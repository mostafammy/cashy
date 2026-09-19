import { Client, GatewayIntentBits, Events, type Guild } from 'discord.js';
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
import { onGuildMemberAdd, onGuildMemberRemove, backfillGuildMembers } from './events/guildMember.js';

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

/**
 * Wrap an async gateway listener so a rejected promise logs instead of
 * becoming an unhandled rejection that takes the shard process down.
 */
function safeHandler<A extends unknown[]>(
  label: string,
  handler: (...args: A) => Promise<void>,
): (...args: A) => void {
  return (...args: A) => {
    handler(...args).catch((error) => {
      console.error(`Error in ${label} handler:`, error);
    });
  };
}

/** Fetch a guild's full member list and upsert it into `guild_members`. */
export async function syncGuildMembership(db: Db, guild: Guild): Promise<void> {
  // A big guild makes this a large fetch; acceptable for v1, and discord.js
  // handles the gateway chunking / rate limiting internally.
  const members = await guild.members.fetch();
  const count = await backfillGuildMembers(db, guild.id, [...members.keys()]);
  console.log(`Backfilled ${count} members for guild ${guild.id}`);
}

export function createBot(db: Db, redis: Redis, ownerIds: string[]) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  const registry = createRegistry();
  for (const command of buildCommands(db, redis, ownerIds)) {
    registry.register(command);
  }

  client.once(
    Events.ClientReady,
    safeHandler('clientReady', async (c: Client<true>) => {
      console.log(`Logged in as ${c.user.tag}`);
      // Covers guilds joined while this process was offline (Fly.io restarts):
      // GuildCreate for those fires before/around ready as a resume, so do an
      // explicit pass over the cache rather than relying on it.
      for (const guild of c.guilds.cache.values()) {
        try {
          await syncGuildMembership(db, guild);
        } catch (error) {
          console.error(`Startup membership backfill failed for guild ${guild.id}:`, error);
        }
      }
    }),
  );

  client.on(
    Events.GuildCreate,
    safeHandler('guildCreate', async (guild) => {
      await syncGuildMembership(db, guild);
    }),
  );

  client.on(
    Events.InteractionCreate,
    safeHandler('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      await registry.handleInteraction(interaction);
    }),
  );

  client.on(
    Events.GuildMemberAdd,
    safeHandler('guildMemberAdd', async (member) => {
      await onGuildMemberAdd(db, member.guild.id, member.id);
    }),
  );

  client.on(
    Events.GuildMemberRemove,
    safeHandler('guildMemberRemove', async (member) => {
      await onGuildMemberRemove(db, member.guild.id, member.id);
    }),
  );

  // Never exit on these — the shard should stay connected and keep serving.
  client.on('error', (error) => {
    console.error('Discord client error:', error);
  });
  redis.on('error', (error) => {
    console.error('Redis error:', error);
  });

  return client;
}
