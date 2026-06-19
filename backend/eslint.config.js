import js from '@eslint/js';
import globals from 'globals';
import jestPlugin from 'eslint-plugin-jest';
import prettierConfig from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Possible errors
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // Best practices
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-return-await': 'error',
      'require-await': 'error',

      // Node.js
      'no-process-exit': 'error',
    },
  },
  {
    files: ['tests/**/*.js', '**/*.test.js'],
    plugins: { jest: jestPlugin },
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      ...jestPlugin.configs.recommended.rules,
    },
  },
  // Prettier must be last — disables all formatting rules
  prettierConfig,
];
