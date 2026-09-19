import 'dotenv/config';
import { loadEnv } from './env.js';
import { createDb } from './db/client.js';
import { createRedis } from './redis/client.js';
import { createBot } from './bot.js';

// Last-resort safety net: log and keep the shard alive rather than letting a
// stray rejection (a floating event-handler promise, a Discord API hiccup)
// terminate the process. Deliberately does not exit.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

const env = loadEnv(process.env);
const db = createDb(env.databaseUrl);
const redis = createRedis(env.redisUrl);
const client = createBot(db, redis, env.ownerIds);

await client.login(env.discordToken);
