import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works under the GitHub Pages project path (/ukCars/).
  base: './',
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
  },
});
