import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Files in public/ that belong to the app shell (data/ is cached as it's viewed instead).
const PUBLIC_SHELL = [
  'manifest.webmanifest',
  'favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

/** Emits sw.js with this build's file list, so the precache always matches the hashed names. */
function serviceWorker() {
  return {
    name: 'ukcars-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      // Inter ships a font file per script; browsers fetch only the subsets a page needs.
      // Precache the Latin one; any other is cached the first time it's used.
      const files = Object.keys(bundle).filter(
        (f) => !f.endsWith('.map') && (!f.endsWith('.woff2') || /inter-latin-wght-normal/.test(f)),
      );
      const precache = ['./', ...files, ...PUBLIC_SHELL].map((f) => (f === './' ? f : `./${f}`));
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
      let source = readFileSync('src/sw.js', 'utf8');
      for (const [line, value] of [
        ["const VERSION = '__VERSION__';", version],
        ['const PRECACHE = __PRECACHE__;', precache],
      ]) {
        if (!source.includes(line)) this.error(`src/sw.js no longer contains "${line}"`);
        source = source.replace(line, line.replace(/'?__[A-Z]+__'?/, JSON.stringify(value)));
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative base so the build works under the GitHub Pages project path (/ukCars/).
  base: './',
  plugins: [serviceWorker()],
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
  },
});
