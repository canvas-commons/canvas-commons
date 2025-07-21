import {
  Plugin,
  PLUGIN_OPTIONS,
  PluginConfig,
} from '@canvas-commons/vite-plugin';
import {FFmpegBridge} from './FFmpegBridge';

export default (): Plugin => {
  let config: PluginConfig;
  return {
    name: 'canvas-commons/ffmpeg',
    [PLUGIN_OPTIONS]: {
      entryPoint: '@canvas-commons/ffmpeg/lib/client',
      async config(value) {
        config = value;
      },
    },
    configureServer(server) {
      new FFmpegBridge(server, config);
    },
  };
};
