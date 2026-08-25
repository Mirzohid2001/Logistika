module.exports = {
  root: true,
  extends: ['@react-native'],
  env: {
    jest: true,
  },
  rules: {
    'prettier/prettier': 'off',
    curly: 'warn',
    // `void asyncCall()` is the intentional fire-and-forget form used by the app.
    'no-void': 'off',
    '@typescript-eslint/no-shadow': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'react-hooks/exhaustive-deps': 'warn',
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
  },
};
