// inject-sw-version.mjs
// Lê APP_VERSION de src/constants.ts, substitui __APP_CACHE_NAME__ no sw.js
// e copia o resultado para dist/sw.js. Roda após o vite build.
import fs from 'fs';
import process from "node:process";

const constants = fs.readFileSync('./src/constants.ts', 'utf-8');
const match = constants.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
if (!match) { console.error('[inject-sw] APP_VERSION não encontrado em constants.ts'); process.exit(1); }

const version = match[1];
const cacheName = `myplacar-v${version}`;

const sw = fs.readFileSync('./sw.js', 'utf-8');
if (!sw.includes('__APP_CACHE_NAME__')) {
  console.warn('[inject-sw] Placeholder __APP_CACHE_NAME__ não encontrado em sw.js — verifique o arquivo.');
}

const injected = sw.replace('__APP_CACHE_NAME__', cacheName);
fs.mkdirSync('./dist', { recursive: true });
fs.writeFileSync('./dist/sw.js', injected);

console.log(`[inject-sw] dist/sw.tempalte.js gerado com CACHE_NAME='${cacheName}'`);
