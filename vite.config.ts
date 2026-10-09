import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

// LINT.IfChange(aistudio_media_plugin)
function aistudioMediaPlugin(): Plugin {
  return {
    name: 'vite-plugin-aistudio-media',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/assets/aistudio/')) {
          const rawPath = req.url.split('?')[0].split('#')[0];
          try {
            const decodedPath = decodeURIComponent(rawPath);
            const relativePath = decodedPath.replace(/^\//, '');
            const aistudioDir = path.resolve(
              __dirname,
              'public',
              'assets',
              'aistudio',
            );
            const filePath = path.resolve(__dirname, 'public', relativePath);
            if (
              filePath.startsWith(aistudioDir + path.sep) &&
              fs.existsSync(filePath) &&
              fs.statSync(filePath).isFile()
            ) {
              const ext = path.extname(filePath).toLowerCase();
              const mimeMap: Record<string, string> = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml',
                '.bmp': 'image/bmp',
                '.ico': 'image/x-icon',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.ogv': 'video/ogg',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg',
                '.pdf': 'application/pdf',
              };
              res.setHeader(
                'Content-Type',
                mimeMap[ext] || 'application/octet-stream',
              );
              res.setHeader('Cache-Control', 'no-cache');
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          } catch {
            // Fall through if URI decoding or file access fails
          }
        }
        next();
      });
    },
  };
}
// LINT.ThenChange(//depot/google3/java/com/google/alkali/boq/makersuite/applet_dev_service/templates/initializers/react_theme/vite.config.ts:aistudio_media_plugin)

function fastCheckinCachePlugin(): Plugin {
  const cacheFilePath = '/tmp/timesync_fast_checkin_cache.json';
  let memoryCache: Record<string, any> = {
    employees: [],
    todayDateStr: '',
    todayCheckIns: [],
    defaultTimeRange: '07:30-07:45',
    deptTimeRanges: {},
    updatedAt: 0,
  };

  try {
    if (fs.existsSync(cacheFilePath)) {
      const raw = fs.readFileSync(cacheFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        memoryCache = { ...memoryCache, ...parsed };
      }
    }
  } catch {
    // Ignore read error
  }

  return {
    name: 'vite-plugin-fast-checkin-cache',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/checkin-cache')) {
          return next();
        }

        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(memoryCache));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 2 * 1024 * 1024) {
              req.destroy();
            }
          });
          req.on('end', () => {
            try {
              const incoming = JSON.parse(body || '{}');
              if (Array.isArray(incoming.employees) && incoming.employees.length > 0) {
                memoryCache.employees = incoming.employees;
              }
              if (typeof incoming.todayDateStr === 'string' && incoming.todayDateStr) {
                memoryCache.todayDateStr = incoming.todayDateStr;
              }
              if (Array.isArray(incoming.todayCheckIns)) {
                memoryCache.todayCheckIns = incoming.todayCheckIns;
              }
              if (typeof incoming.defaultTimeRange === 'string' && incoming.defaultTimeRange) {
                memoryCache.defaultTimeRange = incoming.defaultTimeRange;
              }
              if (incoming.deptTimeRanges && typeof incoming.deptTimeRanges === 'object') {
                memoryCache.deptTimeRanges = {
                  ...memoryCache.deptTimeRanges,
                  ...incoming.deptTimeRanges,
                };
              }
              memoryCache.updatedAt = Date.now();
              fs.writeFile(cacheFilePath, JSON.stringify(memoryCache), () => {});
            } catch {
              // Ignore malformed JSON
            }
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), aistudioMediaPlugin(), fastCheckinCachePlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
