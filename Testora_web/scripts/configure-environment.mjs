import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const environmentPath = join(scriptDirectory, '..', 'src', 'environments', 'environment.ts');
const configuredUrl = process.env.TESTORA_API_URL?.trim();
const configuredOrigin = configuredUrl?.replace(/\/+$/, '');
const apiUrl = configuredOrigin
  ? configuredOrigin.endsWith('/api')
    ? configuredOrigin
    : `${configuredOrigin}/api`
  : '/api';
const nextContent = `export const environment = {\n  apiUrl: ${JSON.stringify(apiUrl)},\n  production: true,\n};\n`;

if (readFileSync(environmentPath, 'utf8') !== nextContent) {
  writeFileSync(environmentPath, nextContent, 'utf8');
}

console.log(`Production API origin configured: ${configuredUrl ? 'environment' : 'same-origin'}`);
