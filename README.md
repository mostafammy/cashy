# Cashy

Cashy is a public, multi-server Discord bot providing a single **universal currency** shared by each user across every server the bot is installed in — an alternative to Probot Credits with one wallet per Discord user instead of one balance per user-per-guild.

## Status

Design complete, implementation not yet started. See the design spec:
[`docs/superpowers/specs/2026-09-19-cashy-universal-currency-design.md`](docs/superpowers/specs/2026-09-19-cashy-universal-currency-design.md).

## Stack

- TypeScript, Node.js, discord.js v14
- PostgreSQL (Neon) via Drizzle ORM
- Redis (Upstash) for cooldowns, rate limits, and leaderboard caching
- Hosted on Fly.io

## Development

Implementation plan and setup instructions land once the implementation phase begins.
