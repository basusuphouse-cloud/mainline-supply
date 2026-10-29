'use strict';

// Zero-dependency server for the Mainline Supply demo storefront.
// Serves static files from public/ and a small JSON API.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 4173;
const PUBLIC_DIR = path.join(__dirname, 'public');
const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');

const PRODUCTS_DELAY_MS = 150;
const ORDER_DELAY_MS = 300;
const MAX_BODY_BYTES = 100 * 1024;

// Clean page routes map to HTML files in public/.
const PAGE_ROUTES = {
  '/': 'index.html',
  '/cart': 'cart.html',
  '/checkout': 'checkout.html',
  '/confirmation': 'confirmation.html',
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// In-memory order counter; resets when the server restarts.
let nextOrderNumber = 100001;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleGetProducts(res) {
  await delay(PRODUCTS_DELAY_MS);
  try {
    const products = JSON.parse(await fs.promises.readFile(PRODUCTS_FILE, 'utf8'));
    sendJson(res, 200, products);
  } catch (err) {
    sendJson(res, 500, { error: 'Could not load products' });
  }
}

async function handlePostOrder(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    await delay(ORDER_DELAY_MS);
    sendJson(res, 400, { error: 'Request body must be valid JSON' });
    return;
  }
  await delay(ORDER_DELAY_MS);

  const items = body && body.items;
  if (!Array.isArray(items) || items.length === 0) {
    sendJson(res, 400, { error: 'items must be a non-empty array' });
    return;
  }

  const orderNumber = 'MS-' + nextOrderNumber++;
  sendJson(res, 201, { orderNumber });
}

async function serveStatic(pathname, res) {
  let relative = PAGE_ROUTES[pathname];
  if (!relative) {
    // Strip a trailing slash on page routes (e.g. /cart/).
    const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    relative = PAGE_ROUTES[trimmed] || pathname;
  }

  // Resolve inside public/ and refuse anything that escapes it.
  const filePath = path.resolve(PUBLIC_DIR, '.' + path.posix.normalize('/' + relative));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) throw new Error('Not a file');
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    sendText(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    // Reject raw ".." segments before URL parsing normalises them away.
    if (/(^|[\/\\])\.\.([\/\\]|$)/.test(req.url.split('?')[0])) {
      sendText(res, 403, 'Forbidden');
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch (err) {
      sendText(res, 400, 'Bad request');
      return;
    }
    if (pathname.includes('\0') || /(^|[\/\\])\.\.([\/\\]|$)/.test(pathname)) {
      sendText(res, 403, 'Forbidden');
      return;
    }

    if (pathname === '/api/products') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      return await handleGetProducts(res);
    }
    if (pathname === '/api/orders') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
      return await handlePostOrder(req, res);
    }
    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'Not found' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'Method not allowed');
      return;
    }
    await serveStatic(pathname, res);
  } catch (err) {
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Mainline Supply running at http://localhost:${PORT}`);
});
