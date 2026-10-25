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
      // Fonts ship a file per script; browsers fetch only the subsets a page needs.
      // Precache the Latin ones; any other is cached the first time it's used.
      const latinFont = /(inter|inter-tight)-latin-wght-normal|ibm-plex-mono-latin-(400|600)-normal/;
      const files = Object.keys(bundle).filter(
        (f) => !f.endsWith('.map') && (!f.endsWith('.woff2') || latinFont.test(f)),
      );
      // HTML pages are emitted after this hook runs, so they're listed by name.
      const pages = ['tools.html', 'mot-times.html', 'your-car.html', 'explore.html', 'chargers.html', 'petrol-diesel.html', 'insights.html', 'electric.html', 'mot.html', 'features.html', 'out-to-play.html', 'bavarian.html', 'origins.html', 'colours.html', 'mini.html', 'make.html', 'suv.html', 'diesel.html', 'plates.html', 'arrivals.html', 'workhorses.html', 'built-to-last.html', 'endangered.html', 'trumps.html'];
      const precache = ['./', ...new Set([...pages, ...files, ...PUBLIC_SHELL])].map((f) => (f === './' ? f : `./${f}`));
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
  build: {
    rolldownOptions: {
      input: {
        home: 'index.html',
        explore: 'explore.html',
        insights: 'insights.html',
        electric: 'electric.html',
        mot: 'mot.html',
        features: 'features.html',
        'out-to-play': 'out-to-play.html',
        bavarian: 'bavarian.html',
        origins: 'origins.html',
        colours: 'colours.html',
        mini: 'mini.html',
        make: 'make.html',
        trumps: 'trumps.html',
        suv: 'suv.html',
        diesel: 'diesel.html',
        plates: 'plates.html',
        arrivals: 'arrivals.html',
        'workhorses': 'workhorses.html',
        'built-to-last': 'built-to-last.html',
        'endangered': 'endangered.html',
        chargers: 'chargers.html',
        'petrol-diesel': 'petrol-diesel.html',
        tools: 'tools.html',
        'mot-times': 'mot-times.html',
        'your-car': 'your-car.html',
      },
    },
  },
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
  },
});
