import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Made on install, not written by hand
    'src/generated/**',
    'public/tesseract/**',
  ]),
  {
    rules: {
      // Vercel's Node 26 has no global Temporal, so date code imports it (design change 54)
      'no-restricted-globals': [
        'error',
        {
          name: 'Temporal',
          message:
            "Use import { Temporal } from 'temporal-polyfill/implementation'; there is no global Temporal on Vercel.",
        },
      ],
    },
  },
]);

export default eslintConfig;
