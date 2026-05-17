module.exports = {
  extends: ['@commitlint/config-conventional'],
  ignores: [commit => commit.includes('[skip ci]')],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        '2d',
        'core',
        'create',
        'deps',
        'deps-dev',
        'docs',
        'e2e',
        'editor',
        'examples',
        'ffmpeg',
        'legacy',
        'player',
        'vite-plugin',
      ],
    ],
  },
};
