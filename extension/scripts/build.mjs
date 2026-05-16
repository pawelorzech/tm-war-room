// Builds dist/tm-hub-companion.user.js — a Tampermonkey/Violentmonkey/PDA
// compatible userscript. Bundle is plain JS (no module workers, no
// dynamic imports) so it can run inside the userscript sandbox.
//
// Production build mode: `node scripts/build.mjs`
// Watch mode (for local dev): `node scripts/build.mjs --watch`

import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const distFile = resolve(root, 'dist/tm-hub-companion.user.js');
// Also publish into the Next.js static export so hub.tri.ovh/companion.user.js
// resolves. This is what the userscript's @updateURL points at, so installs
// can self-update without us shipping a separate hosting story.
const publicDir = resolve(root, '..', 'frontend', 'public');
const publicFile = resolve(publicDir, 'companion.user.js');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const HUB_ORIGIN = process.env.TM_HUB_ORIGIN || 'https://hub.tri.ovh';

const banner = `// ==UserScript==
// @name         TM Hub Companion
// @namespace    https://hub.tri.ovh/
// @version      ${pkg.version}
// @description  Injects TM Hub faction intel (OFF-LIMITS flags, threat info) into torn.com pages.
// @author       The Masters [TM]
// @match        https://www.torn.com/*
// @connect      hub.tri.ovh
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @run-at       document-idle
// @updateURL    ${HUB_ORIGIN}/companion.user.js
// @downloadURL  ${HUB_ORIGIN}/companion.user.js
// @homepageURL  ${HUB_ORIGIN}/install
// @supportURL   ${HUB_ORIGIN}/install
// @license      MIT
// ==/UserScript==

/* eslint-disable */
`;

const options = {
  entryPoints: [resolve(root, 'src/index.ts')],
  outfile: distFile,
  bundle: true,
  format: 'iife',
  target: ['chrome100', 'firefox100', 'safari15'],
  // Sprint 2 of the perf plan: flipped minifyIdentifiers + linked sourcemap.
  // Identifier minification used to be off so stack traces stayed readable;
  // sourcemap is now publicly hosted at hub.tri.ovh/companion.user.js.map
  // (Companion is already open-source on Greasy Fork — see Plans/chc-zadba-bardoz-snazzy-wave.md
  // for the disclosure-vs-perf decision). Result: ~15-25% gzip shrink, and
  // stack traces remain useful via the map.
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: true,
  sourcemap: 'linked',
  banner: { js: banner },
  define: {
    'process.env.TM_HUB_ORIGIN': JSON.stringify(HUB_ORIGIN),
    'process.env.TM_COMPANION_VERSION': JSON.stringify(pkg.version),
  },
  logLevel: 'info',
};

mkdirSync(resolve(root, 'dist'), { recursive: true });

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Watching for changes…');
} else {
  await build(options);
  // esbuild's banner injection works, but double-check the file starts with
  // ==UserScript== — Tampermonkey rejects anything that does not.
  const out = readFileSync(distFile, 'utf8');
  if (!out.startsWith('// ==UserScript==')) {
    writeFileSync(distFile, banner + out);
  }
  console.log(`Built ${distFile}`);

  // Publish to frontend/public/ so Next.js static export serves it at
  // /companion.user.js (and /companion.user.js.map). Skip silently if the
  // frontend repo layout is missing (e.g. someone is building the
  // extension in isolation).
  if (existsSync(publicDir)) {
    copyFileSync(distFile, publicFile);
    console.log(`Published ${publicFile}`);
    const mapSrc = `${distFile}.map`;
    if (existsSync(mapSrc)) {
      const mapDest = `${publicFile}.map`;
      copyFileSync(mapSrc, mapDest);
      console.log(`Published ${mapDest}`);
      // esbuild emits `//# sourceMappingURL=tm-hub-companion.user.js.map`
      // (basename of the original outfile). After copying to
      // frontend/public/companion.user.js, that URL no longer resolves —
      // the map file is now called companion.user.js.map. Rewrite the
      // pragma so Chrome DevTools picks up the correct file in prod.
      const publicContent = readFileSync(publicFile, 'utf8').replace(
        '//# sourceMappingURL=tm-hub-companion.user.js.map',
        '//# sourceMappingURL=companion.user.js.map',
      );
      writeFileSync(publicFile, publicContent);
    }
  }
}
