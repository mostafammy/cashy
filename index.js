import fs from 'node:fs';
import { execSync } from 'node:child_process';

// Automatically build TypeScript if dist/ does not exist yet (e.g. on Git deployments)
if (!fs.existsSync(new URL('./dist/shard.js', import.meta.url))) {
  console.log('[Cashy] dist/shard.js not found. Compiling TypeScript...');
  execSync('npm run build', { stdio: 'inherit' });
}

// Start the sharding manager
await import('./dist/shard.js');
