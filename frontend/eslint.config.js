import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: ['.svelte-kit/**', 'build/**', 'dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,ts,svelte}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2020,
        extraFileExtensions: ['.svelte'],
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2020,
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      svelte,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...svelte.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'warn',
      // TypeScript already reports unknown identifiers, and it understands
      // type-only names such as RequestInit, which no-undef reads as globals
      // and cannot find. Leaving it on produces false errors on valid code.
      'no-undef': 'off',
      // Superseded by the TypeScript-aware rule above; the base rule double
      // reports and does not understand type positions.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: typescriptParser,
      },
    },
  },
  prettier,
];
