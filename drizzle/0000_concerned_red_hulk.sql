CREATE TABLE IF NOT EXISTS "bot_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"currency_name" text DEFAULT 'Coins' NOT NULL,
	"currency_symbol" text DEFAULT '🪙' NOT NULL,
	"daily_amount" bigint DEFAULT 100 NOT NULL,
	"work_min" bigint DEFAULT 20 NOT NULL,
	"work_max" bigint DEFAULT 80 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guild_config" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"shop_channel_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guild_members" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"in_guild" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shop_items" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"price" bigint NOT NULL,
	"role_id" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"counterparty_user_id" text,
	"amount" bigint NOT NULL,
	"type" text NOT NULL,
	"guild_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
