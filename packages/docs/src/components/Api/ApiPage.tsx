import {
  DocsSidebarProvider,
  DocsVersionProvider,
} from '@docusaurus/plugin-content-docs/client';
import renderRoutes from '@docusaurus/renderRoutes';
import {HtmlClassNameProvider, ThemeClassNames} from '@docusaurus/theme-common';
import {ApiProvider} from '@site/src/contexts/api';
import {FiltersProvider} from '@site/src/contexts/filters';
import api from '@site/src/generated/api';
import sidebar from '@site/src/generated/sidebar';
import DocRootLayout from '@theme/DocRoot/Layout';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import React from 'react';

interface ApiPageProps {
  route: {
    routes?: unknown[];
  };
}

// Synthetic version metadata so the docs-plugin context providers can hydrate
// without a real `plugin-content-docs` route behind them. The API pages are
// registered as plugin routes by `./typedoc.js`, so they don't go through the
// docs plugin's loader; we reconstruct enough shape for `DocRoot`,
// `DocItem`, and `DocVersionBanner` to function.
const ApiVersion = {
  label: 'Current',
  banner: null,
  badge: false,
  className: '',
  isLast: true,
  noIndex: false,
  pluginId: 'api',
  version: 'current',
  docsSidebars: {api: sidebar},
  docs: {},
};

export default function ApiPage(props: ApiPageProps) {
  const subRoutes = props.route.routes ?? [];

  return (
    <ApiProvider lookup={api.lookups} urlLookup={api.urlLookups}>
      <FiltersProvider>
        <HtmlClassNameProvider
          className={clsx(ThemeClassNames.page.docsDocPage)}
        >
          <Layout>
            <DocsVersionProvider version={ApiVersion}>
              <DocsSidebarProvider name="api" items={sidebar}>
                <DocRootLayout>{renderRoutes(subRoutes)}</DocRootLayout>
              </DocsSidebarProvider>
            </DocsVersionProvider>
          </Layout>
        </HtmlClassNameProvider>
      </FiltersProvider>
    </ApiProvider>
  );
}
