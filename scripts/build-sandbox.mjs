import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');

await build({
  entryPoints: ['src/sandbox/main.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  target: 'es2018',
  format: 'iife',
  define: {
    __html__: JSON.stringify(html)
  }
});
