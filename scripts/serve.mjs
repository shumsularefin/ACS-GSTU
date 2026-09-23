import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('public');
const types = {'.svg':'image/svg+xml','.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf','.ics':'text/calendar; charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'};
http.createServer((req,res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch {res.writeHead(400).end();return;}
  if(pathname==='/membership.html'){res.writeHead(301,{Location:'/index.html#membership'}).end();return;}
  const file = path.resolve(root,'.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404,{'Content-Type':'text/html'}).end(fs.readFileSync(path.join(root,'404.html')));return;}
  res.writeHead(200,{'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
}).listen(4173,'127.0.0.1',() => console.log('Preview: http://127.0.0.1:4173'));

