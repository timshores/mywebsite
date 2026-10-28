// @ts-check
// Font lab: the regular site plus a floating panel for trying Google Fonts on every page.
// Run with `npm run font-lab`. Dev only; the production build never sees the panel.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import baseConfig from './astro.config.mjs';

const panel = fileURLToPath(new URL('./scripts/font-lab-panel.js', import.meta.url));

export default {
  ...baseConfig,
  integrations: [
    ...(baseConfig.integrations ?? []),
    {
      name: 'font-lab',
      hooks: {
        /** @param {any} options */
        'astro:config:setup': ({ command, injectScript, addWatchFile }) => {
          if (command !== 'dev') return;
          addWatchFile(panel);
          injectScript('head-inline', readFileSync(panel, 'utf8'));
        },
      },
    },
  ],
};
