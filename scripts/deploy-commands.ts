import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { loadEnv } from '../src/env.js';
import { buildCommands } from '../src/bot.js';

const env = loadEnv(process.env);
const clientId = process.env.DISCORD_CLIENT_ID;
if (!clientId) throw new Error('Missing DISCORD_CLIENT_ID');

// db/redis are unused by command `.data` definitions but required by the factory signature
const commands = buildCommands({} as never, {} as never, env.ownerIds).map((c) => c.data.toJSON());

const rest = new REST().setToken(env.discordToken);
await rest.put(Routes.applicationCommands(clientId), { body: commands });
console.log(`Registered ${commands.length} global commands.`);
