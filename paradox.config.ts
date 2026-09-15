import { defineParadoxConfig } from '@ankhorage/paradox';

export default defineParadoxConfig({
  mode: 'write',
  docs: {
    title: '@ankhorage/deploy-provider-eas',
    description: 'EAS deployment provider for Ankhorage application shipment.',
  },
  package: {
    root: '.',
    entrypoints: ['src/index.ts'],
  },
  output: { dir: './paradox' },
});
