import typescriptBase from '@rollup/plugin-typescript';

/**
 * @param {import('@rollup/plugin-typescript').RollupTypescriptOptions} options
 * @returns {Plugin}
 */
export default function typescript(options = {}) {
  const {compilerOptions, ...rest} = options;
  return typescriptBase({
    compilerOptions: {
      declaration: false,
      declarationMap: false,
      ...(compilerOptions ?? {}),
    },
    ...rest,
  });
}
