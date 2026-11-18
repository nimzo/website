import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    author: z.string().default('Nimzo team'),
    tags: z.array(z.string()).default([]),
    primary_keyword: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
