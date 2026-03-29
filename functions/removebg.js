const API_KEY = 'PJAVTGFzBq1FmhnaKpHqy2Dk';
const API_URL = 'https://api.remove.bg/v1.0/removebg';

export async function onRequest(context) {
  try {
    const formData = await context.request.formData();
    const imageFile = formData.get('image_file');

    if (!imageFile || typeof imageFile === 'string') {
      return new Response(JSON.stringify({
        error: 'No image',
        debug: { formDataKeys: [...formData.keys()], receivedKeys: [...formData.keys()].map(k => ({k, v: String(formData.get(k))})) }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const fd = new FormData();
    fd.append('image_file', imageFile);
    fd.append('size', 'auto');
    fd.append('format', 'png');

    const r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY },
      body: fd,
    });

    if (!r.ok) {
      return new Response(JSON.stringify({ error: 'API error', details: await r.text() }), {
        status: r.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(r.body, { headers: { 'Content-Type': 'image/png' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}