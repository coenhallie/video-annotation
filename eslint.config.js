// Flat ESLint config for Vue 3 + TypeScript + unused-imports
import vue from 'eslint-plugin-vue';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import vueParser from 'vue-eslint-parser';
import unused from 'eslint-plugin-unused-imports';

// One definition: the unused-imports rule wraps @typescript-eslint/no-unused-vars
// and pairs with the no-unused-imports autofix, so enabling both reported every
// unused variable twice.
const unusedVars = [
  'warn',
  {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
    ignoreRestSiblings: true,
  },
];

export default [
  // Global ignores. This only works as an object with no other keys: an
  // `ignores` next to `files` scopes that one block and ignores nothing globally,
  // which is how build output and agent worktrees ended up being linted.
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.claude/**',
      '.netlify/**',
      'src/types/generated/**',
    ],
  },
  // Vue recommended flat config first to ensure SFC parsing
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        sourceType: 'module',
        ecmaVersion: 2024,
        extraFileExtensions: ['.vue'],
      },
    },
    plugins: {
      '@typescript-eslint': ts,
      vue,
      'unused-imports': unused,
    },
    rules: {
      // unused variables/imports cleanup
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': unusedVars,

      // Vue rules aligned with project style
      'vue/no-unused-components': 'warn',
      'vue/no-mutating-props': 'off',
      'vue/require-explicit-emits': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': ts,
      'unused-imports': unused,
    },
    rules: {
      // unused variables/imports cleanup
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': unusedVars,
    },
  },
  {
    // Test files mount throwaway harness components with defineComponent, which
    // is the point of the file rather than a structural problem. The rule is
    // about keeping shipped components in their own file.
    files: ['**/__tests__/**/*.{ts,tsx,js,jsx,vue}', '**/*.{test,spec}.{ts,tsx,js,jsx}'],
    rules: {
      'vue/one-component-per-file': 'off',
    },
  },
];
