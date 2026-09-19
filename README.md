# Cashy

Cashy is a public, multi-server Discord bot providing a single **universal currency** shared by each user across every server the bot is installed in — an alternative to Probot Credits with one wallet per Discord user instead of one balance per user-per-guild.

## Status

v1 implemented: universal balance, `/balance`, `/daily`, `/work`, `/pay`, `/leaderboard`
(guild + global), per-guild `/shop-view`/`/shop-buy`, guild-admin
`/shop-add`/`/shop-remove`, and bot-owner-only `/owner` commands (with
`mint`/`adjust-balance`/`set-config` subcommands, gated by `OWNER_IDS`).
See the design spec and implementation plan under `docs/superpowers/`.

## Stack

- TypeScript, Node.js, discord.js v14
- PostgreSQL (Neon) via Drizzle ORM
- Redis (Upstash) for cooldowns, rate limits, and leaderboard caching
- Hosted on Fly.io

## Development

1. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`,
   `DISCORD_CLIENT_ID`, `OWNER_IDS` (your Discord user ID), `DATABASE_URL`
   (a Neon Postgres connection string), and `REDIS_URL` (an Upstash Redis TCP
   connection string, NOT the REST API URL).
2. `pnpm install`
3. `pnpm exec drizzle-kit generate && pnpm run db:migrate`
4. `pnpm run deploy-commands` — registers slash commands with Discord.
5. `pnpm run dev` — starts the bot.

Run tests with `pnpm test`.
