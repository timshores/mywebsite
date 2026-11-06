// @ts-check
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

// The element index: a panel listing the page's elements by id or class, to find one and copy its selector.
// Dev only; the production build never sees it (scripts/element-index-panel.js).
const elementIndex = fileURLToPath(new URL('./scripts/element-index-panel.js', import.meta.url));

export default defineConfig({
  site: 'https://timshores.com',
  integrations: [
    {
      name: 'element-index',
      hooks: {
        'astro:config:setup': ({ command, injectScript, addWatchFile }) => {
          if (command !== 'dev') return;
          addWatchFile(elementIndex);
          injectScript('page', readFileSync(elementIndex, 'utf8'));
        },
      },
    },
  ],
});
