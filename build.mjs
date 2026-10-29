// Minifies index.src.html (inline CSS included) and copies static assets into dist/.
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { minify } from 'html-minifier-terser';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

const html = await readFile('index.src.html', 'utf8');
const out = await minify(html, {
  collapseWhitespace: true,
  conservativeCollapse: false,
  removeComments: true,
  removeRedundantAttributes: true,
  minifyCSS: true,
  minifyJS: true,
});
await writeFile('dist/index.html', out);

for (const f of ['favicon.svg', 'robots.txt', 'sitemap.xml', 'og.png']) {
  await cp(f, `dist/${f}`).catch(() => console.warn(`skipped ${f}`));
}
await cp('fonts', 'dist/fonts', { recursive: true });

console.log(`index.html: ${html.length} -> ${out.length} bytes`);
