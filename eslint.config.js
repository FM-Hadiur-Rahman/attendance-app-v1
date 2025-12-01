// @ts-check

import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import pluginReactNative from 'eslint-plugin-react-native';

export default [
  {
    // Global ignores
    ignores: [
      'node_modules/',
      'android/',
      'ios/',
      'build/',
      'dist/',
      '*.config.js',
    ],
  },
  {
    // Base configuration for all files
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // React Native globals
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        require: 'readonly',
        __DEV__: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        alert: 'readonly',
        navigator: 'readonly',
        window: 'readonly',
        document: 'readonly',
        // Node.js globals
        process: 'readonly',
      },
    },
    plugins: {
      react: pluginReact,
      'react-hooks': pluginReactHooks,
      'react-native': pluginReactNative,
    },
    rules: {
      // Basic ESLint recommended rules
      'no-unused-vars': 'off', // Use TypeScript's version
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      
      // React specific rules
      'react/react-in-jsx-scope': 'off', // Not needed for React 17+
      'react/prop-types': 'off', // We're using TypeScript
      'react/jsx-uses-react': 'off', // Not needed for React 17+
      'react/jsx-uses-vars': 'error',
      
      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    // Configuration for JSX/TSX files
    files: ['**/*.{tsx,jsx}'],
    rules: {
      // React Native specific rules
      'react-native/no-unused-styles': 'error',
      'react-native/split-platform-components': 'off', // Not always needed
      'react-native/no-inline-styles': 'warn',
      'react-native/no-color-literals': 'off', // Too restrictive
      'react-native/no-raw-text': 'off', // Doesn't work well with TypeScript
    },
  },
  {
    // Configuration for test files
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  }
];