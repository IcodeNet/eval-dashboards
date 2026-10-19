import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { rewriteDocLinks } from './src/plugins/rewrite-doc-links.mjs';

export default defineConfig({
  site: 'https://icodenet.github.io',
  base: '/eval-dashboards',
  output: 'static',
  trailingSlash: 'always',
  markdown: {
    processor: satteri({ mdastPlugins: [rewriteDocLinks] }),
  },
});
