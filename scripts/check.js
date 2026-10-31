import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (directory !== 'public') await checkDirectory(file);
    } else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.error || result.status !== 0) process.exit(1);
    }
  }
}
for (const directory of ['api', 'server', 'scripts', 'admin', 'public', 'test']) {
  await checkDirectory(directory);
}
console.log('All project JavaScript files passed syntax checks.');
