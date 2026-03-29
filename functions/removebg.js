const API_KEY = 'PJAVTGFzBq1FmhnaKpHqy2Dk';
const API_URL = 'https://api.remove.bg/v1.0/removebg';

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
    if (chunk[0] === 0x2D && chunk[1] === 0x2D) continue;
    if (chunk[0] === 0x0D && chunk[1] === 0x0A) chunk = chunk.slice(2);
    let he = -1;
    for (let i = 0; i < chunk.length - 3; i++) {
      if (chunk[i] === 0x0D && chunk[i+1] === 0x0A && chunk[i+2] === 0x0D && chunk[i+3] === 0x0A) { he = i; break; }
    }
    if (he === -1) continue;
    const headerStr = chunk.slice(0, he).toString('utf8');
    let bodyData = chunk.slice(he + 4);
    if (bodyData.length >= 2 && bodyData[bodyData.length-2] === 0x0D && bodyData[bodyData.length-1] === 0x0A) bodyData = bodyData.slice(0, -2);
    const nm = headerStr.match(/name="([^"]+)"/);
    const fn = headerStr.match(/filename="([^"]+)"/);
    if (nm && fn) parts.push({ name: nm[1], filename: fn[1], data: bodyData });
  }
  return parts;
}

export async function onRequest(context) {
  try {
    const ct = context.request.headers.get('content-type') || '';
    const boundaryMatch = ct.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      return new Response(JSON.stringify({ error: 'Missing content-type boundary' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await context.request.arrayBuffer();
    const buffer = new Uint8Array(body);
    const parts = parseMultipart(buffer, boundaryMatch[1]);
    
    const img = parts.find(p => p.name === 'image_file' || p.name === 'image');
    if (!img) {
      return new Response(JSON.stringify({ 
        error: 'No image', 
        debug: { partsFound: parts.map(p => ({name: p.name, fn: p.filename, size: p.data.length})), bodySize: body.byteLength }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const fd = new FormData();
    fd.append('image_file', new Blob([img.data], { type: 'image/jpeg' }), img.filename || 'image.jpg');
    fd.append('size', 'auto');
    fd.append('format', 'png');

    const r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY },
      body: fd,
    });

    if (!r.ok) {
      return new Response(JSON.stringify({ error: 'Remove.bg API error', details: await r.text() }), {
        status: r.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(r.body, { headers: { 'Content-Type': 'image/png' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
