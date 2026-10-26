import express from 'express';
import path from 'node:path';

// Only browser assets belong on the public filesystem route. The build also
// places the backend bundle here; never serve it or its embedded-source map.
export function serveFrontend(directory: string): express.RequestHandler {
  const assets = express.static(directory, { dotfiles: 'deny' });
  return (req, res, next) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const name = path.posix.basename(decodeURIComponent(pathname));
    if (name === 'server.cjs' || name.endsWith('.map') || name.endsWith('.cjs')) {
      res.sendStatus(404);
      return;
    }
    assets(req, res, next);
  };
}
