/**
 * Background Remover - Cloudflare Pages Worker
 * Serves static files and handles /removebg API
 */

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

const HTML_PAGE = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Background Remover</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;padding:20px}.container{max-width:900px;margin:0 auto}h1{text-align:center;color:white;font-size:2.5rem;margin-bottom:10px;text-shadow:0 2px 4px rgba(0,0,0,.2)}.subtitle{text-align:center;color:rgba(255,255,255,.9);margin-bottom:30px;font-size:1.1rem}.upload-area{background:white;border-radius:20px;padding:40px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)}.drop-zone{border:3px dashed #ddd;border-radius:15px;padding:50px 20px;cursor:pointer;transition:all .3s}.drop-zone:hover{border-color:#667eea;background:#f8f9ff}.drop-zone.dragover{border-color:#667eea;background:#f0f3ff}.drop-zone-icon{font-size:4rem;margin-bottom:15px}.drop-zone-text{font-size:1.2rem;color:#333;margin-bottom:10px}.drop-zone-hint{color:#888;font-size:.9rem}#fileInput{display:none}.btn{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;padding:15px 40px;font-size:1.1rem;border-radius:50px;cursor:pointer;margin-top:20px;transition:transform .2s,box-shadow .2s}.btn:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(102,126,234,.4)}.btn:disabled{opacity:.6;cursor:not-allowed;transform:none}.result-area{display:none;margin-top:30px}.result-area.show{display:block}.preview-container{display:flex;gap:20px;justify-content:center;flex-wrap:wrap}.preview-box{flex:1;min-width:300px;max-width:400px}.preview-box h3{text-align:center;margin-bottom:15px;color:#333}.preview-box img{width:100%;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.1)}.download-btn{display:block;width:100%;max-width:400px;margin:30px auto 0;background:linear-gradient(135deg,#11998e 0%,#38ef7d 100%)}.loading{display:none;text-align:center;padding:40px}.loading.show{display:block}.spinner{width:50px;height:50px;border:4px solid #f3f3f3;border-top:4px solid #667eea;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}.error{background:#fee;color:#c00;padding:15px;border-radius:10px;margin-top:20px;display:none}.error.show{display:block}.usage-hint{text-align:center;margin-top:20px;color:#888;font-size:.9rem}</style></head><body><div class="container"><h1>🖼️ Background Remover</h1><p class="subtitle">免费在线去除图片背景 · Powered by Cloudflare Workers</p><div class="upload-area"><div class="drop-zone" id="dropZone"><div class="drop-zone-icon">📁</div><div class="drop-zone-text">拖拽图片到这里，或点击上传</div><div class="drop-zone-hint">支持 PNG、JPG、WEBP，最大 10MB</div></div><input type="file" id="fileInput" accept="image/png,image/jpeg,image/webp"><button class="btn" id="uploadBtn" style="display:none">上传并处理</button><div class="loading" id="loading"><div class="spinner"></div><p>正在处理图片，请稍候...</p></div><div class="error" id="error"></div><div class="result-area" id="resultArea"><div class="preview-container"><div class="preview-box"><h3>原图</h3><img id="originalImg" src="" alt="Original"></div><div class="preview-box"><h3>结果</h3><img id="resultImg" src="" alt="Result"></div></div><button class="btn download-btn" id="downloadBtn">下载处理后的图片</button></div><p class="usage-hint">免费版每天 50 次 API 调用</p></div></div><script>const dropZone=document.getElementById('dropZone'),fileInput=document.getElementById('fileInput'),uploadBtn=document.getElementById('uploadBtn'),loading=document.getElementById('loading'),resultArea=document.getElementById('resultArea'),originalImg=document.getElementById('originalImg'),resultImg=document.getElementById('resultImg'),downloadBtn=document.getElementById('downloadBtn'),error=document.getElementById('error');let currentFile=null,resultBlob=null;dropZone.addEventListener('click',()=>fileInput.click());fileInput.addEventListener('change',e=>{if(e.target.files[0])handleFile(e.target.files[0])});dropZone.addEventListener('dragover',e=>{e.preventDefault();dropZone.classList.add('dragover')});dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('dragover'));dropZone.addEventListener('drop',e=>{e.preventDefault();dropZone.classList.remove('dragover');if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0])});function handleFile(file){if(!['image/png','image/jpeg','image/webp'].includes(file.type)){showError('请上传 PNG、JPG 或 WEBP 格式的图片');return}if(file.size>10*1024*1024){showError('图片大小不能超过 10MB');return}currentFile=file;originalImg.src=URL.createObjectURL(file);uploadBtn.style.display='inline-block';resultArea.classList.remove('show');error.classList.remove('show')}uploadBtn.addEventListener('click',async()=>{if(!currentFile)return;uploadBtn.disabled=true;loading.classList.add('show');resultArea.classList.remove('show');error.classList.remove('show');try{const fd=new FormData();fd.append('image_file',currentFile);const resp=await fetch('/removebg',{method:'POST',body:fd});if(!resp.ok){const err=await resp.json();throw new Error(err.error||err.details||'处理失败')}resultBlob=await resp.blob();resultImg.src=URL.createObjectURL(resultBlob);resultArea.classList.add('show')}catch(err){showError(err.message)}finally{uploadBtn.disabled=false;loading.classList.remove('show')}});downloadBtn.addEventListener('click',()=>{if(!resultBlob)return;const a=document.createElement('a');a.href=URL.createObjectURL(resultBlob);a.download='background-removed.png';a.click()});function showError(msg){error.textContent=msg;error.classList.add('show')}</script></body></html>`;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

  if (context.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  // API endpoint
  if (context.request.method === 'POST' && url.pathname === '/removebg') {
    const ct = context.request.headers.get('content-type') || '';
    const m = ct.match(/boundary=(.+)/);
    if (!m) return new Response(JSON.stringify({ error: 'Missing boundary' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    const body = await context.request.arrayBuffer();
    const buf = new Uint8Array(body);
    const parts = parseMultipart(buf, m[1]);
    const img = parts.find(p => p.name === 'image_file' || p.name === 'image');
    if (!img) return new Response(JSON.stringify({ error: 'No image' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    const fd = new FormData();
    fd.append('image_file', new Blob([img.data], { type: 'image/jpeg' }), img.filename);
    fd.append('size', 'auto');
    fd.append('format', 'png');
    const r = await fetch(API_URL, { method: 'POST', headers: { 'X-Api-Key': API_KEY }, body: fd });
    if (!r.ok) return new Response(JSON.stringify({ error: 'API error', details: await r.text() }), { status: r.status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    return new Response(r.body, { headers: { 'Content-Type': 'image/png', ...corsHeaders } });
  }

  // Serve static files (index.html) or the SPA
  return context.next(context.request);
}
