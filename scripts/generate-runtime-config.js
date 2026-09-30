// Generates public/runtime-config.js from environment variables at build time.
//
// Why: public/find-a-part.html is served as a static file (Vite copies public/*
// verbatim), so import.meta.env substitution does not apply inside it. This script
// runs via the `prebuild` npm script (npm runs it automatically before `build`),
// so `npm run build` on Cloudflare Pages always refreshes the file from the
// project's environment variables before Vite copies public/ to dist/.
//
// The generated file is gitignored — real values never land in the repo.

import { writeFileSync } from 'node:fs';

const url = process.env.VITE_SUPABASE_URL ?? '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';

if (!url || !anonKey) {
  console.warn(
    '[runtime-config] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — ' +
    'writing empty placeholders. find-a-part.html will not be able to reach Supabase.'
  );
}

const contents =
  '// AUTO-GENERATED at build time by scripts/generate-runtime-config.js — do not edit.\n' +
  `window.__G10_RUNTIME_CONFIG = ${JSON.stringify({ SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey })};\n`;

writeFileSync(new URL('../public/runtime-config.js', import.meta.url), contents);
console.log('[runtime-config] wrote public/runtime-config.js');
