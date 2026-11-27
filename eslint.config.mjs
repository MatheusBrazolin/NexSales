import next from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import jsxA11y from 'eslint-plugin-jsx-a11y'

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'instalador/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'public/sw.js',
      'next-env.d.ts',
    ],
  },

  ...next,
  ...nextTs,

  {
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    rules: {
      // next/core-web-vitals already registers the jsx-a11y plugin, so only
      // its rule set is pulled in here — redefining the plugin is an error.
      ...jsxA11y.flatConfigs.recommended.rules,

      // Internal navigation goes through next/link; the native anchors left
      // are external links and the installer download.
      'jsx-a11y/anchor-is-valid': 'off',

      // This is a point-of-sale system: every autoFocus sits on the field the
      // operator is about to type in (barcode search, modal inputs). Removing
      // it would cost a click per sale, which is the opposite of accessible.
      'jsx-a11y/no-autofocus': 'off',

      // `any` is a smell worth seeing in review, not a reason to fail CI.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Args prefixed with _ are intentionally unused (signatures, catch).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // console.warn/error carry real offline + sync diagnostics; log does not.
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // --- React Compiler heuristics, kept visible but non-blocking ---------
      // Both rules over-approximate on patterns this codebase uses correctly:
      //
      // set-state-in-effect: reading browser-only state on mount (localStorage,
      //   navigator.onLine, matchMedia) MUST happen in an effect here, because
      //   the server render has no access to it and a lazy initializer would
      //   produce a hydration mismatch.
      //
      // refs: flags any function passed to a callback that *might* read a ref.
      //   The flagged sites read refs inside event handlers and transitions,
      //   never during render.
      //
      // Left as warnings so a genuinely new violation still shows up.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },

  {
    // Generic shadcn primitive: associating the label with a control is the
    // caller's job via htmlFor, which the app does.
    files: ['src/components/ui/label.tsx'],
    rules: { 'jsx-a11y/label-has-associated-control': 'off' },
  },

  {
    // Electron main/preload and build scripts run in Node.
    files: ['electron/**/*.cjs', 'scripts/**/*.mjs'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-console': 'off' },
  },
]

export default config
