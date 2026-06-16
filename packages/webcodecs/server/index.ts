import {
  PLUGIN_OPTIONS,
  Plugin,
  PluginConfig,
} from '@canvas-commons/vite-plugin';
import * as fs from 'fs';
import type {IncomingMessage} from 'node:http';
import * as path from 'path';

const ROUTE = '/__canvas-commons-webcodecs';

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Vite plugin that registers the in-browser WebCodecs exporter.
 *
 * @remarks
 * The client encodes an mp4 then uploads it to the server to write to the output directory.
 *
 * - `POST /write?name=` — receive the finished mp4 and write it out.
 */
export default (): Plugin => {
  let config: PluginConfig;
  let writeCounter = 0;
  return {
    name: 'canvas-commons/webcodecs',
    [PLUGIN_OPTIONS]: {
      entryPoint: '@canvas-commons/webcodecs/client',
      async config(value) {
        config = value;
      },
    },
    configureServer(server) {
      server.middlewares.use(ROUTE, (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (req.method !== 'POST' || url.pathname !== '/write') {
          res.statusCode = 404;
          res.end();
          return;
        }

        const name = path.basename(url.searchParams.get('name') || 'project');
        const dir = path.resolve(config?.output ?? 'output');
        const finalPath = path.join(dir, `${name}.mp4`);
        // Per-request temp path so overlapping writes for the same name can't
        // clobber each other's in-progress file.
        const tmpPath = path.join(
          dir,
          `.${name}.${process.pid}-${writeCounter++}.webcodecs.tmp.mp4`,
        );

        readBody(req)
          .then(async buffer => {
            await fs.promises.mkdir(dir, {recursive: true});
            await fs.promises.writeFile(tmpPath, buffer);
            await fs.promises.rename(tmpPath, finalPath);
            res.statusCode = 200;
            res.end(JSON.stringify({output: finalPath}));
          })
          .catch(async error => {
            // Best-effort cleanup; never touch an already-sent response.
            await fs.promises.rm(tmpPath, {force: true}).catch(() => {});
            if (res.writableEnded) return;
            res.statusCode = 500;
            res.end(String((error as Error)?.message ?? error));
          });
      });
    },
  };
};
