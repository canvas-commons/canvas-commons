/// <reference types="vite/client" />

import 'vite/types/customEvent';

declare module 'vite/types/customEvent' {
  interface CustomEventMap {
    'canvas-commons:meta': {source: string; data: any};
    'canvas-commons:meta-ack': {source: string};
    'canvas-commons:export': {
      data: string;
      subDirectories: string[];
      mimeType: string;
      frame: number;
      name: string;
    };
    'canvas-commons:export-ack': {frame: number};
    'canvas-commons:assets': {urls: string[]};
  }
}
