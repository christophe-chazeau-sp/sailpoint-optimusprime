import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

const hooksDir = new URL('../.git/hooks/', import.meta.url);
if (!existsSync(hooksDir)) {
  process.exit(0);
}

mkdirSync(hooksDir, { recursive: true });
copyFileSync(new URL('./pre-commit', import.meta.url), new URL('../.git/hooks/pre-commit', import.meta.url));
