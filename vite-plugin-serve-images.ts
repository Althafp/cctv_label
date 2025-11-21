import type { Plugin } from 'vite';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function serveImagesPlugin(): Plugin {
  return {
    name: 'serve-images',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/FIXED_20_11_2025/')) {
          // Remove leading slash and join with cwd
          const urlPath = req.url.substring(1); // Remove leading /
          const filePath = join(process.cwd(), urlPath);
          
          try {
            if (!existsSync(filePath)) {
              console.warn(`Image not found: ${filePath}`);
              next();
              return;
            }
            
            const file = readFileSync(filePath);
            const ext = req.url.split('.').pop()?.toLowerCase();
            const contentType = 
              ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
              ext === 'png' ? 'image/png' :
              'application/octet-stream';
            
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            res.end(file);
          } catch (err) {
            console.error(`Error serving image ${filePath}:`, err);
            next();
          }
        } else {
          next();
        }
      });
    }
  };
}

