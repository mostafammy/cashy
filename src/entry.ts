import 'dotenv/config';
import { loadEnv } from './env.js';
import { createDb } from './db/client.js';
import { createRedis } from './redis/client.js';
import { createBot } from './bot.js';

// Last-resort safety net: log and keep the shard alive rather than letting a
// stray rejection (a floating event-handler promise, a Discord API hiccup)
// terminate the process. Deliberately does not exit.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

let env;
try {
  env = loadEnv(process.env);
  console.log('[Shard Entry] Environment variables loaded successfully.');
} catch (err) {
  console.error('[Shard Entry] FATAL: Environment variable validation failed:', err);
  process.exit(1);
}

console.log('[Shard Entry] Connecting to Database and Redis...');
const db = createDb(env.databaseUrl);
const redis = createRedis(env.redisUrl);
const client = createBot(db, redis, env.ownerIds);

console.log('[Shard Entry] Connecting to Discord Gateway...');
try {
  await client.login(env.discordToken);
  console.log('[Shard Entry] client.login() dispatched successfully.');
} catch (err) {
  console.error('[Shard Entry] FATAL: client.login() failed:', err);
  process.exit(1);
}
