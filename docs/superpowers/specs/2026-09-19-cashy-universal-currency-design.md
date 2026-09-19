# Cashy — Universal Discord Currency Bot: Design

Date: 2026-09-19
Status: Approved for implementation planning

## Purpose

A public, multi-server Discord bot ("Cashy") providing a single **universal
currency** shared by a user across every server the bot is installed in —
positioned as an alternative to Probot Credits, but with one wallet per
Discord user instead of one balance per user-per-guild.

## Scope (v1)

Core economy parity, Discord-only (no web dashboard in v1):
`/balance`, `/daily`, `/work`, `/pay`, `/leaderboard` (+ `global` variant),
per-guild `/shop` (view/buy) backed by role rewards, guild-admin shop
management, and bot-owner-only currency minting/adjustment.

Out of scope for v1: gambling/minigames, rob/steal, investments/interest,
inventory/crafting, web dashboard. These are candidate phase-2 additions
once the core loop is proven.

## Architecture

```
Discord Gateway <--WS--> Bot Process (Node/TS, discord.js, ShardingManager)
                               |
                               +--> Postgres (Neon) — users, transactions, shop, config
                               +--> Redis (Upstash) — cooldowns, rate limits, leaderboard cache
```

Single deployable: one Fly.io app running the bot process (persistent,
no free-tier sleep). `ShardingManager` wired in from day one (starts at
1 shard) so scaling past ~2,500 guilds later is a config change, not a
rewrite.

## Stack

- **Language/runtime:** TypeScript, Node.js
- **Discord library:** discord.js v14 (Gateway-based; slash commands +
  full event access for future phases)
- **ORM:** Drizzle ORM + `drizzle-kit` migrations — chosen over Prisma
  for lower per-query overhead (no separate query-engine process),
  which matters for latency-sensitive, high-frequency balance writes.
- **Database:** PostgreSQL on Neon (free tier), built-in connection
  pooling.
- **Cache/ephemeral state:** Redis on Upstash (free tier,
  pay-per-request) — cooldowns, rate limits, leaderboard cache.
- **Hosting (bot process):** Fly.io — persistent VM, no spin-down
  (unlike Render's free tier, which sleeps and would drop the Gateway
  connection).
- **Testing:** Vitest (unit tests on economy/cooldown logic),
  integration tests against a local Dockerized Postgres for
  concurrency/transaction behavior.

## Data model

- **`users`** — `user_id` (PK, Discord user ID — global, no guild
  scoping), `balance`, `created_at`. One row per Discord user across
  the whole bot.
- **`transactions`** — `id`, `user_id` (or `from_user`/`to_user` for
  `/pay`), `amount`, `type` (`daily` | `work` | `pay` | `shop_purchase`
  | `owner_adjust`), `guild_id` (nullable — audit context of *where*
  the action happened, not a scoping key), `timestamp`. Every
  balance-affecting action writes one row here.
- **`shop_items`** — `id`, `guild_id`, `name`, `price`, `role_id`,
  `description`. Shops remain per-guild since role rewards are
  inherently tied to one server; purchases are paid from the buyer's
  global balance.
- **`bot_config`** — single-row table: currency name, symbol/emoji,
  daily amount, work amount range. Editable only via an owner-only
  command. Not configurable per guild — the currency reads as one
  consistent brand everywhere, like Probot Credits.
- **`guild_config`** — per-guild settings unrelated to currency
  identity (e.g. shop channel). No currency-name or economy-amount
  overrides live here.
- **`guild_members`** (optional join table, added if live-fetching
  guild membership proves too slow at scale) — `guild_id`, `user_id`,
  kept in sync via `guildMemberAdd`/`guildMemberRemove` events, used to
  filter `/leaderboard` to the current server's members without a live
  Discord API call per request.
- **Redis keys** — `cooldown:daily:{user_id}`, `cooldown:work:{user_id}`
  (global per user, no guild segment — a per-guild cooldown would let
  users farm the same global currency once per server per day), plus
  `leaderboard:{guild_id}` and `leaderboard:global` cache entries with
  a short TTL, invalidated on any balance-affecting write.

## Commands and permission tiers

1. **Everyone:** `/balance`, `/daily`, `/work`, `/pay`, `/leaderboard`,
   `/leaderboard global`, `/shop view`, `/shop buy`.
2. **Guild admin (Discord "Manage Server" permission):** `/shop add`,
   `/shop remove`, guild `/config` (shop channel etc.) — scoped
   strictly to that admin's own guild's `shop_items`/`guild_config`
   rows. Guild admins have **no path** to mint or adjust balances.
3. **Bot owner only** (gated by a hardcoded `OWNER_IDS` env var, not by
   any Discord permission or role — so no server's configuration can
   ever grant this): `/owner mint`, `/owner adjust-balance`, `/owner
   set-config` (currency name/symbol/daily/work amounts in
   `bot_config`).

This tiering exists specifically because currency is global: if any
guild admin could mint or adjust balances, that admin could inflate
currency in their own server and have it spent in every other server
the bot serves. Centralizing minting in the bot owner is the same
control Probot exercises over Credits.

## Data flow: `/pay`

Interaction → validate amount and target user → single Postgres
transaction (`SELECT ... FOR UPDATE` on the sender's `users` row,
debit sender, credit recipient, insert a `transactions` row, commit) →
invalidate any cached leaderboard entries touching either user → reply
with an ephemeral confirmation. All balance-affecting commands route
through one shared transactional helper (`lib/economy.ts`) — no
command hand-rolls its own balance math, so there is exactly one place
where money can be created, destroyed, or moved incorrectly.

## Data flow: `/daily`, `/work`

Interaction → check Redis cooldown key for `{user_id}` (global, not
guild-scoped) → if clear, credit `bot_config`-defined amount via the
same transactional helper, set cooldown TTL (24h), insert
`transactions` row → reply. Cooldowns live in Redis (not in-memory) so
a bot restart never resets them — restarting the process must not be
an exploit for re-claiming `/daily`.

## Data flow: `/leaderboard`

Default (no argument): query top `users` balances filtered to the
current guild's membership (via `guild_members` join table or live
guild member cache) — most relevant to the server the command was run
in, and avoids surfacing users who aren't part of that community.
`/leaderboard global`: same query without the guild filter, ranking
every user of the bot. Both reads go through the Redis cache with a
short TTL before hitting Postgres.

## Reliability / error handling

- Every balance mutation is wrapped in a single DB transaction — no
  partial credit/debit is possible.
- A centralized interaction error handler catches Discord API errors
  (rate limits, missing permissions) and Postgres/Redis errors, logs
  them, and replies to the user with a friendly ephemeral message
  instead of letting the shard crash.
- `bot_config` is cached in Redis with a short TTL, invalidated on
  `/owner set-config` writes, so reads of currency name/amounts don't
  hit Postgres on every command.

## Testing strategy

- **Unit (Vitest):** `lib/economy.ts` and `lib/cooldowns.ts` logic,
  with mocked DB/Redis clients — covers debit/credit math, insufficient
  balance handling, cooldown TTL logic.
- **Integration:** tests against a local Dockerized Postgres exercising
  concurrent `/pay` calls to confirm the row-locking transaction
  prevents negative balances or lost updates under race conditions.
- Command handlers are kept thin (parse input → call a `lib/`
  function → reply), so the bulk of logic is unit-testable without
  spinning up discord.js or a live Gateway connection.

## Deployment

- Fly.io: single `fly.toml` + Dockerfile; secrets for `DISCORD_TOKEN`,
  `DATABASE_URL`, `REDIS_URL`, `OWNER_IDS`.
- Neon (Postgres) and Upstash (Redis) provisioned on free tiers.
- Slash command registration is a deploy-time script
  (`npm run deploy-commands`), run explicitly rather than on every
  process boot.

## Phase 2 candidates (not in this spec's scope)

- Web dashboard (Next.js on Vercel, Discord OAuth login) reading/writing
  the same Postgres DB — no bot-side data-layer changes required to add
  this later.
- Gambling/minigames, rob/steal, interest/investments, inventory system.
- Sharding beyond the initial single-shard `ShardingManager` setup, once
  guild count approaches the ~2,500-guild-per-shard threshold.
