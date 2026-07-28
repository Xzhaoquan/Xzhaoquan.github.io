import http from 'node:http';

const baseUrl = process.env.HEXO_ADMIN_URL ?? 'http://127.0.0.1:4190';
const endpoints = [
  '/',
  '/api/project/status',
  '/api/content/post',
  '/api/content/draft',
  '/api/content/page',
  '/api/taxonomy',
  '/api/recycle',
  '/api/config',
  '/api/config/common',
  '/api/theme',
  '/api/tasks',
  '/api/logs',
  '/api/git/status',
  '/api/deploy/check'
];

function request(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, baseUrl);
    const client = url.protocol === 'http:' ? http : null;
    if (!client) return reject(new Error('only HTTP local URLs are supported'));
    const request = client.get(url, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.setTimeout(10_000, () => request.destroy(new Error('request timed out')));
    request.on('error', reject);
  });
}

let failed = false;
for (const endpoint of endpoints) {
  try {
    const response = await request(endpoint);
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    const body = response.body;
    if (endpoint === '/' && !body.includes('<div id="root">')) throw new Error('missing frontend mount node');
    if (endpoint.startsWith('/api/') && !body.includes('"ok":true')) throw new Error('unexpected API response envelope');
    console.log(`OK  ${endpoint}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) {
  console.error(`Hexo Admin smoke test failed against ${baseUrl}. Start the local panel before retrying.`);
  process.exitCode = 1;
} else {
  console.log(`Hexo Admin smoke test passed against ${baseUrl}.`);
}
