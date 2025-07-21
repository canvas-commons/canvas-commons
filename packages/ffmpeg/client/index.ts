import type {ExporterClass} from '@canvas-commons/core';
import {makePlugin} from '@canvas-commons/core';
import {FFmpegExporterClient} from './FFmpegExporterClient';

export default makePlugin({
  name: 'ffmpeg-plugin',
  exporters(): ExporterClass[] {
    return [FFmpegExporterClient];
  },
});
