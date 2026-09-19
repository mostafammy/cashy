export interface Env {
  discordToken: string;
  databaseUrl: string;
  redisUrl: string;
  ownerIds: string[];
}

const REQUIRED = ['DISCORD_TOKEN', 'DATABASE_URL', 'REDIS_URL', 'OWNER_IDS'] as const;

export function loadEnv(source: NodeJS.ProcessEnv): Env {
  for (const key of REQUIRED) {
    if (!source[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    discordToken: source.DISCORD_TOKEN!,
    databaseUrl: source.DATABASE_URL!,
    redisUrl: source.REDIS_URL!,
    ownerIds: source.OWNER_IDS!.split(',').map((id) => id.trim()).filter(Boolean),
  };
}
