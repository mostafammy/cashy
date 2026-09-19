/**
 * Test env accessor.
 *
 * Tests in this project run against the REAL remote services (Neon Postgres,
 * Upstash Redis) configured in .env. An earlier bug in this project had every
 * test file silently fall back to `postgres://...@localhost:5432/...` /
 * `redis://localhost:6379`, so the suite validated against a leftover local
 * Docker container / Memurai service instead of the services production uses.
 *
 * Never reintroduce a default here: a missing env var must fail loudly.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Tests run against the real remote services — set ${name} in .env ` +
        `(vitest.config.ts loads it via dotenv). No localhost fallback is provided on purpose.`,
    );
  }
  return value;
}
