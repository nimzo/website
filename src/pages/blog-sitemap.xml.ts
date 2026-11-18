import { getPosts } from '../lib/posts';

export async function GET() {
  const posts = await getPosts();
  const urls = [
    '<url><loc>https://nimzo.com/blog</loc></url>',
    ...posts.map(
      (p) => `<url><loc>https://nimzo.com/blog/${p.data.slug}</loc><lastmod>${p.data.date.toISOString().slice(0, 10)}</lastmod></url>`,
    ),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
