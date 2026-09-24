import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Resilient self-healing for incomplete container node_modules
try {
  require.resolve('lodash.snakecase');
} catch {
  console.log('[Cashy] lodash.snakecase missing in node_modules. Installing...');
  execSync('npm install lodash.snakecase', { stdio: 'inherit' });
}

// Automatically build TypeScript if dist/ does not exist yet (e.g. on Git deployments)
if (!fs.existsSync(new URL('./dist/shard.js', import.meta.url))) {
  console.log('[Cashy] dist/shard.js not found. Compiling TypeScript...');
  execSync('npm run build', { stdio: 'inherit' });
}

// Start the sharding manager
await import('./dist/shard.js');
