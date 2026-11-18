// Copies the static site export in site/ into dist/. No transformation is applied.
import { mkdir, cp, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('site', 'dist', { recursive: true });
for (const f of ['favicon.svg', 'og.png']) {
  await cp(f, `dist/${f}`).catch(() => console.warn(`skipped ${f}`));
}
console.log('site/ -> dist/');
