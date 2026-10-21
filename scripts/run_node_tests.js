// Run the current isolated UXP regressions on Windows and CI alike.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const dir = path.resolve(__dirname, '../tests');
const files = fs.readdirSync(dir).filter(name => /^test_.*\.js$/.test(name)).sort();
if (!files.length) throw new Error('No current Node regression scripts found');
for (const name of files) {
  const result = spawnSync(process.execPath, [path.join(dir, name)], {stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`${files.length} current Node regression scripts passed`);
