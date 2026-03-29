const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const url = require('url');

const API_KEY = 'PJAVTGFzBq1FmhnaKpHqy2Dk';
const PORT = 8788;
const API_URL = 'https://api.remove.bg/v1.0/removebg';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

function mime(p) {
  const ext = path.extname(p);
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const bStart = '--' + boundary;
  let pos = 0;

  while (true) {
    const bPos = buffer.indexOf(bStart, pos);
    if (bPos === -1) break;

    const nextPos = buffer.indexOf(bStart, bPos + bStart.length);
    if (nextPos === -1) break;

    let chunk = buffer.slice(bPos + bStart.length, nextPos);
    pos = nextPos + bStart.length;

    // Skip "--" end marker
    if (chunk[0] === 0x2D && chunk[1] === 0x2D) continue;

    // Remove leading CRLF
    if (chunk[0] === 0x0D && chunk[1] === 0x0A) chunk = chunk.slice(2);

    // Find header end: CRLF CRLF
    let he = -1;
    for (let i = 0; i < chunk.length - 3; i++) {
      if (chunk[i] === 0x0D && chunk[i+1] === 0x0A && chunk[i+2] === 0x0D && chunk[i+3] === 0x0A) {
        he = i;
        break;
      }
    }
    if (he === -1) continue;

    const headerStr = chunk.slice(0, he).toString('utf8');
    let bodyData = chunk.slice(he + 4);

    // Remove trailing CRLF
    if (bodyData.length >= 2 && bodyData[bodyData.length-2] === 0x0D && bodyData[bodyData.length-1] === 0x0A) {
      bodyData = bodyData.slice(0, bodyData.length - 2);
    }

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);

    if (nameMatch && filenameMatch) {
      parts.push({ name: nameMatch[1], filename: filenameMatch[1], data: bodyData });
    }
  }
  return parts;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);

  if (req.method === 'GET') {
    const filePath = path.join(__dirname, parsed.pathname === '/' ? 'index.html' : parsed.pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': mime(filePath) });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  if (req.method === 'POST' && parsed.pathname === '/removebg') {
    const ct = req.headers['content-type'] || '';
    console.log('POST /removebg, content-type:', ct.substring(0, 80));

    const boundaryMatch = ct.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      console.log('No boundary found');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing content-type boundary' }));
      return;
    }

    const boundary = boundaryMatch[1];
    console.log('Boundary:', boundary);

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    console.log('Body size:', body.length);

    const parts = parseMultipart(body, boundary);
    console.log('Parts found:', parts.length, parts.map(p => ({ name: p.name, filename: p.filename, size: p.data.length })));

    // Accept both 'image' and 'image_file' (browser may add '_file' suffix)
    const imagePart = parts.find(p => p.name === 'image' || p.name === 'image_file');
    if (!imagePart) {
      console.log('No image part found');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No image provided' }));
      return;
    }

    const tmpInput = `/tmp/rembg_in_${Date.now()}.jpg`;
    const tmpOutput = `/tmp/rembg_out_${Date.now()}.png`;
    fs.writeFileSync(tmpInput, imagePart.data);
    console.log('Saved input file:', tmpInput, 'size:', fs.statSync(tmpInput).size);

    const result = await new Promise((resolve) => {
      const curl = spawn('curl', [
        '-s', '-X', 'POST',
        '-F', `image_file=@${tmpInput}`,
        '-F', 'size=auto',
        '-F', 'format=png',
        '-H', `X-Api-Key: ${API_KEY}`,
        '-o', tmpOutput,
        '-w', 'EXIT:%{exitcode}|HTTP:%{http_code}|SIZE:%{size_download}',
        API_URL,
      ]);

      let stderr = '';
      curl.stderr.on('data', d => { stderr += d.toString(); });
      curl.on('close', (code) => {
        resolve({ code, stderr });
      });
    });

    fs.unlink(tmpInput, () => {});
    console.log('Curl result:', result);

    if (!fs.existsSync(tmpOutput) || fs.statSync(tmpOutput).size === 0) {
      console.log('Output file empty or missing');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API returned empty response', details: result.stderr.substring(0, 200) }));
      fs.unlink(tmpOutput, () => {});
      return;
    }

    console.log('Success, output size:', fs.statSync(tmpOutput).size);
    res.writeHead(200, { 'Content-Type': 'image/png' });
    const stream = fs.createReadStream(tmpOutput);
    stream.on('error', () => fs.unlink(tmpOutput, () => {}));
    stream.on('end', () => fs.unlink(tmpOutput, () => {}));
    stream.pipe(res);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Background Remover running at http://0.0.0.0:${PORT}`);
});