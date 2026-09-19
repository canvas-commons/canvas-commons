const path = require('path');

const OutputDir = path.resolve(__dirname, 'static/fiddle');

module.exports = context => ({
  name: 'docusaurus-fiddle-plugin',
  async loadContent() {
    // The package is ESM-only and this plugin is CommonJS.
    const {buildFiddleVendor} =
      await import('@canvas-commons/fiddle/build-vendor');

    return await buildFiddleVendor({
      outputDir: OutputDir,
      publicBase: `${context.siteConfig.baseUrl}fiddle`,
    });
  },
  contentLoaded({content, actions}) {
    actions.setGlobalData(content);
  },
});
