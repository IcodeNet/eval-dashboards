import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { glossaryLinks } from './src/plugins/glossary-links.mjs';
import { rewriteDocLinks } from './src/plugins/rewrite-doc-links.mjs';

export default defineConfig({
  site: 'https://icodenet.github.io',
  base: '/eval-dashboards',
  output: 'static',
  trailingSlash: 'always',
  markdown: {
    processor: satteri({ mdastPlugins: [glossaryLinks, rewriteDocLinks] }),
  },
});
