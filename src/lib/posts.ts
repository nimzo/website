import { getCollection } from 'astro:content';

export const tagSlug = (t: string) => t.toLowerCase().replace(/\s+/g, '-');
export const tagLabels: Record<string, string> = {
  terraform: 'Terraform',
  'policy-as-code': 'Policy as code',
  security: 'Security',
  drift: 'Drift',
  'ai-agents': 'AI agents',
};
export const tagLabel = (s: string) => tagLabels[s] ?? s;
export const formatDate = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Published posts, newest first. Drafts are excluded in production builds. */
export async function getPosts() {
  const all = await getCollection('blog', (p) => import.meta.env.DEV || !p.data.draft);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}
