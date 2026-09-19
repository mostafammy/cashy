import 'dotenv/config';
import { loadEnv } from './env.js';
import { createDb } from './db/client.js';
import { createRedis } from './redis/client.js';
import { createBot } from './bot.js';

const env = loadEnv(process.env);
const db = createDb(env.databaseUrl);
const redis = createRedis(env.redisUrl);
const client = createBot(db, redis, env.ownerIds);

await client.login(env.discordToken);
