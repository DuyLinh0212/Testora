import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const browserDirectory = join(scriptDirectory, '..', 'dist', 'Testora_web', 'browser');
const csrEntry = join(browserDirectory, 'index.csr.html');
const standardEntry = join(browserDirectory, 'index.html');

if (!existsSync(csrEntry)) {
  throw new Error(`Angular browser entry was not found: ${csrEntry}`);
}

copyFileSync(csrEntry, standardEntry);
console.log('Vercel SPA entry prepared: dist/Testora_web/browser/index.html');
