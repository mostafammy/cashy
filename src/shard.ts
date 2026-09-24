import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { ShardingManager } from 'discord.js';
import { loadEnv } from './env.js';

const env = loadEnv(process.env);

const entryPath = fileURLToPath(
  new URL(import.meta.url.endsWith('.ts') ? './entry.ts' : './entry.js', import.meta.url)
);

const manager = new ShardingManager(entryPath, {
  token: env.discordToken,
  totalShards: 'auto',
  execArgv: process.execArgv,
});

manager.on('shardCreate', (shard) => console.log(`Launched shard ${shard.id}`));
await manager.spawn();
