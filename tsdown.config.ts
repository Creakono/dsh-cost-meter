import { clientBundle } from './.dsh/packages/client/tsdown.client.ts'

const PLUGIN_ID = 'dsh-cost-meter'
const clientFace = clientBundle(PLUGIN_ID, [])

export default (inlineConfig) => {
  const [, clientConfig] = clientFace(inlineConfig)
  return [
    {
      entry: { index: 'src/index.ts' },
      outDir: 'dist',
      format: 'esm',
      platform: 'node',
      target: 'es2024',
      fixedExtension: false,
      dts: false,
      clean: false,
      // The runtime must not depend on a schemastery hoisted by some other plugin.
      deps: {
        alwaysBundle: ['@deepseek-ai/schemastery'],
      },
    },
    {
      ...clientConfig,
      outDir: 'dist',
    },
  ]
}
