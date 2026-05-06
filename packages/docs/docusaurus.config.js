// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Canvas Commons',
  // The tagline should be kept in sync with the description in the Header component.
  tagline:
    'A community-driven TypeScript library for creating animated videos using the Canvas API. Forked from Motion Canvas to continue development.',
  url: 'https://canvascommons.io',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  favicon: 'img/favicon.svg',
  organizationName: 'canvas-commons',
  projectName: 'canvas-commons.github.io',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  markdown: {
    mermaid: true,
  },
  customFields: {
    discordApi:
      'https://discord.com/api/guilds/1396626525331132437/widget.json',
    discordUrl: 'https://chat.canvascommons.io',
    githubApi: 'https://api.github.com/repos/canvas-commons/canvas-commons',
    githubUrl: 'https://github.com/canvas-commons/canvas-commons',
  },
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      metadata: [{name: 'keywords', content: 'typescript, animation, library'}],
      image: 'img/banner.png',
      colorMode: {
        defaultMode: 'dark',
      },
      navbar: {
        title: 'Canvas Commons',
        logo: {
          alt: 'Canvas Commons Logo',
          src: 'img/logo.svg',
          srcDark: 'img/logo_dark.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docs',
            position: 'left',
            label: 'Docs',
          },
          {to: '/api/core', label: 'API', position: 'left'},
          {to: '/blog', label: 'Blog', position: 'left'},
        ],
      },
      footer: {
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Docs',
                to: 'docs',
              },
              {
                label: 'API',
                to: 'api/core',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'Discord',
                href: 'https://chat.canvascommons.io',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'Blog',
                to: '/blog',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/canvas-commons/canvas-commons',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Canvas Commons. Built with Docusaurus.`,
      },
      algolia: {
        appId: '4ANT70GVO5',
        apiKey: '9b12a7a1ae8ffb54fdb6e8769882d140',
        indexName: 'Canvas Commons',
      },
      prism: {
        theme: require('./config/codeTheme'),
        darkTheme: require('./config/codeTheme'),
        additionalLanguages: ['glsl'],
        magicComments: [
          {
            className: 'theme-code-block-highlighted-line',
            line: 'highlight-next-line',
            block: {start: 'highlight-start', end: 'highlight-end'},
          },
          {
            className: 'prettier-ignore',
            line: 'prettier-ignore',
          },
        ],
      },
    }),
  themes: [
    [
      '@docusaurus/theme-classic',
      {
        customCss: require.resolve('./src/css/custom.css'),
      },
    ],
    '@docusaurus/theme-search-algolia',
    '@docusaurus/theme-mermaid',
  ],
  plugins: [
    './typedoc',
    './bundle',
    [
      '@docusaurus/plugin-content-docs',
      {
        routeBasePath: '/docs',
        sidebarPath: 'sidebars.js',
        exclude: ['**/api/core/*.md', '**/api/2d/*.md'],
        showLastUpdateAuthor: true,
        docItemComponent: '@site/src/components/DocPage',
        admonitions: {
          tag: ':::',
          keywords: [
            'note',
            'tip',
            'info',
            'caution',
            'danger',
            'experimental',
          ],
        },
        editUrl: ({versionDocsDirPath, docPath}) =>
          `https://github.com/canvas-commons/canvas-commons/blob/main/packages/docs/${versionDocsDirPath}/${docPath}`,
      },
    ],
    [
      '@docusaurus/plugin-content-blog',
      {
        showReadingTime: true,
        editUrl: ({blogDirPath, blogPath}) =>
          `https://github.com/canvas-commons/canvas-commons/blob/main/packages/docs/${blogDirPath}/${blogPath}`,
      },
    ],
    '@docusaurus/plugin-content-pages',
    '@docusaurus/plugin-debug',
    '@docusaurus/plugin-sitemap',
    [
      './editor',
      {
        examples: [
          {
            name: 'Random',
            fileName: 'random',
            url: 'Random values generator',
          },
          {
            name: 'Quickstart',
            fileName: 'quickstart',
            url: 'Quickstart example',
          },
          {
            name: 'Logging',
            fileName: 'logging',
            url: 'Logging example',
          },
          {
            name: 'Presentation',
            fileName: 'presentation',
            url: 'Presentation example',
          },
        ],
      },
    ],
  ],
};

module.exports = config;
