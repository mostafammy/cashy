import 'dotenv/config';
import { ShardingManager } from 'discord.js';
import { loadEnv } from './env.js';

const env = loadEnv(process.env);

const manager = new ShardingManager('./dist/entry.js', {
  token: env.discordToken,
  totalShards: 'auto',
});

manager.on('shardCreate', (shard) => console.log(`Launched shard ${shard.id}`));
await manager.spawn();
