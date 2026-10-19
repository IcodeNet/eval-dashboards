import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

/** The Markdown in `docs/` is the only source; the site never keeps a copy. */
const docs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: '../docs' }),
});

export const collections = { docs };
