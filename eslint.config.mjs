import js from '@eslint/js';
import tsdoc from 'eslint-plugin-tsdoc';
import {defineConfig} from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/.*',
      '**/*.js',
      '**/*.d.ts',
      'packages/template/**',
      'packages/create/template-*/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    plugins: {
      tsdoc,
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'require-yield': 'off',
      'grouped-accessor-pairs': ['error', 'getBeforeSet'],
      eqeqeq: ['error', 'always', {null: 'ignore'}],
      curly: ['error', 'multi-line'],
      'no-constant-condition': ['error', {checkLoops: 'all'}],
      'no-inner-declarations': [
        'error',
        'functions',
        {blockScopedFunctions: 'disallow'},
      ],
      '@typescript-eslint/explicit-member-accessibility': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unused-expressions': [
        'error',
        {allowShortCircuit: true},
      ],
      'tsdoc/syntax': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          ignoreRestSiblings: true,
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
          filter: {
            regex: '^(__html)$',
            match: false,
          },
        },
        {
          selector: ['variable', 'import'],
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'variable',
          modifiers: ['global'],
          format: ['PascalCase', 'UPPER_CASE'],
        },
        {
          selector: 'variable',
          modifiers: ['exported'],
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'variable',
          modifiers: ['exported', 'global'],
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
        },
        {
          selector: ['parameter', 'variable'],
          modifiers: ['unused'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'function',
          modifiers: ['global'],
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: ['typeLike', 'enumMember'],
          format: ['PascalCase'],
        },
        {
          selector: 'typeParameter',
          format: ['PascalCase'],
          prefix: ['T'],
        },
      ],
    },
  },
);
