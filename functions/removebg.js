const API_KEY = 'PJAVTGFzBq1FmhnaKpHqy2Dk';
const API_URL = 'https://api.remove.bg/v1.0/removebg';

export async function onRequest(context) {
  const ct = context.request.headers.get('content-type') || '';
  const body = await context.request.text();
  
  // Try to parse as FormData directly
  const fd = new FormData();
  // Use FileReader approach or let FormData handle it
  
  // Let's try getting the file via context.request.formData()
  const formData = await context.request.formData();
  const imageFile = formData.get('image_file');
  
  if (!imageFile || typeof imageFile === 'string') {
    const allKeys = [...formData.keys()];
    return new Response(JSON.stringify({ error: 'No image', debug: { keys: allKeys, ct: ct.substring(0, 100), bodyLen: body.length } }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const removeBgFd = new FormData();
  removeBgFd.append('image_file', imageFile);
  removeBgFd.append('size', 'auto');
  removeBgFd.append('format', 'png');
  
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY },
    body: removeBgFd,
  });
  
  if (!r.ok) {
    const errText = await r.text();
    return new Response(JSON.stringify({ error: 'API error', details: errText }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(r.body, { headers: { 'Content-Type': 'image/png' } });
}
