import {buildFiddleVendor} from './build-vendor';

const USAGE =
  'Usage: node lib/cli.js <output-directory> <public-base> [--skip-type-pack]\n' +
  'Example: node lib/cli.js packages/docs/static/fiddle /fiddle';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const skipTypePack = args.includes('--skip-type-pack');
  const [outputDir, publicBase] = args.filter(arg => !arg.startsWith('--'));
  if (!outputDir || !publicBase) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const manifest = await buildFiddleVendor({
    outputDir,
    publicBase,
    skipTypePack,
  });
  const imports = Object.keys(manifest.importMap.imports).length;
  console.log(
    `[build-vendor] ${manifest.engineVersion}-${manifest.hash}: ` +
      `${imports} import(s), types ${manifest.typesUrl ?? 'skipped'}.`,
  );
}

await main();
