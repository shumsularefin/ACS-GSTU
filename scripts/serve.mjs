// Local preview of public/ with the redirects and headers from firebase.json.
// PORT sets the port (default 4173). EXTRA_CONNECT adds origins to the CSP (used for the emulators).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('public');
const hosting = JSON.parse(fs.readFileSync('firebase.json', 'utf8')).hosting;
const port = Number(process.env.PORT || 4173);
const types = {
  '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ics': 'text/calendar; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.txt': 'text/plain',
};

const glob = (pattern) =>
  new RegExp(
    '^/?' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '§')
        .replace(/\*/g, '[^/]*')
        .replace(/§/g, '.*') +
      '$',
  );

function redirect(pathname) {
  for (const rule of hosting.redirects || []) {
    if (rule.source && rule.source === pathname) return rule.destination;
    if (rule.regex) {
      const match = pathname.match(new RegExp(rule.regex.replace(/\(\?P</g, '(?<')));
      if (match) return rule.destination.replace(/:(\w+)/g, (_, name) => match.groups?.[name] ?? '');
    }
  }
  return null;
}

function headers(pathname) {
  const result = {};
  for (const rule of hosting.headers || [])
    if (glob(rule.source).test(pathname)) for (const { key, value } of rule.headers) result[key] = value;
  if (process.env.EXTRA_CONNECT && result['Content-Security-Policy'])
    result['Content-Security-Policy'] = result['Content-Security-Policy']
      .replace('connect-src', `connect-src ${process.env.EXTRA_CONNECT}`)
      .replace('frame-src', `frame-src ${process.env.EXTRA_CONNECT}`);
  return result;
}

http
  .createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const target = redirect(pathname);
    if (target) {
      res.writeHead(301, { Location: target }).end();
      return;
    }
    if (pathname === '/') pathname = '/index.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res
        .writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', ...headers('/404.html') })
        .end(fs.readFileSync(path.join(root, '404.html')));
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', ...headers(pathname) });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}`));
