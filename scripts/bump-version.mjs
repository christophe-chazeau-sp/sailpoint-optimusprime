import { readFileSync, writeFileSync } from 'node:fs';

const versionFile = new URL('../src/app/version.ts', import.meta.url);
const packageFile = new URL('../package.json', import.meta.url);

const source = readFileSync(versionFile, 'utf8');
const match = source.match(/APP_VERSION = '(\d+)\.(\d+)'/);
if (!match) {
  throw new Error('Could not read APP_VERSION from src/app/version.ts');
}

const next = `${match[1]}.${Number(match[2]) + 1}`;
writeFileSync(versionFile, source.replace(match[0], `APP_VERSION = '${next}'`));

const pkg = JSON.parse(readFileSync(packageFile, 'utf8'));
pkg.version = `${next}.0`;
writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Version ${match[1]}.${match[2]} -> ${next}`);
