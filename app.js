(() => {
  const video = document.getElementById('video');
  const workCanvas = document.getElementById('workCanvas');
  const workCtx = workCanvas.getContext('2d');
  const flashEl = document.getElementById('flash');
  const countdownEl = document.getElementById('countdown');
  const shotProgressEl = document.getElementById('shotProgress');
  const startBtn = document.getElementById('startBtn');
  const stripSelect = document.getElementById('stripSelect');
  const frameSelect = document.getElementById('frameSelect');
  const switchCamBtn = document.getElementById('switchCamBtn');

  const stripOutlet = document.getElementById('stripOutlet');
  const stripPrint = document.getElementById('stripPrint');
  const stripImg = document.getElementById('stripImg');
  const resultActions = document.getElementById('resultActions');
  const downloadBtn = document.getElementById('downloadBtn');
  const retakeBtn = document.getElementById('retakeBtn');

  const DEFAULT_STRIP = {
    id: '',
    name: 'Classic',
    url: null,
    width: 640,
    height: 1880,
    photoCount: 3,
    slots: null, // computed below
  };

  let strips = [];
  let frames = [];
  let currentStream = null;
  let facingMode = 'user';
  let busy = false;
  let currentStripUrl = null;

  function computeSlots(cfg) {
    const marginX = 40, marginTop = 40, marginBottom = 220, gap = 24;
    const slotW = cfg.width - marginX * 2;
    const availableH = cfg.height - marginTop - marginBottom - gap * (cfg.photoCount - 1);
    const slotH = Math.max(10, Math.floor(availableH / cfg.photoCount));
    const slots = [];
    for (let i = 0; i < cfg.photoCount; i++) {
      slots.push({ x: marginX, y: marginTop + i * (slotH + gap), w: slotW, h: slotH });
    }
    return slots;
  }
  DEFAULT_STRIP.slots = computeSlots(DEFAULT_STRIP);

  // ---------- Camera ----------

  async function startCamera() {
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
    }
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      video.srcObject = currentStream;
    } catch (err) {
      alert('Could not access the camera: ' + err.message);
    }
  }

  switchCamBtn.addEventListener('click', () => {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    startCamera();
  });

  // ---------- Template loading ----------

  async function loadTemplates() {
    const [stripsRes, framesRes] = await Promise.all([
      fetch('/api/strips').then((r) => r.json()),
      fetch('/api/frames').then((r) => r.json()),
    ]);
    strips = stripsRes;
    frames = framesRes;

    stripSelect.innerHTML = '<option value="">Classic (default)</option>' +
      strips.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    frameSelect.innerHTML = '<option value="">None</option>' +
      frames.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');

    renderTemplateGrid('stripGrid', strips, 'strips', true);
    renderTemplateGrid('frameGrid', frames, 'frames', false);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderTemplateGrid(gridId, items, kind, isStrip) {
    const grid = document.getElementById(gridId);
    if (!items.length) {
      grid.innerHTML = '<p class="empty-note">Nothing uploaded yet.</p>';
      return;
    }
    grid.innerHTML = items.map((it) => `
      <div class="template-card" data-id="${it.id}" data-kind="${kind}">
        <img src="${it.url}" alt="${escapeHtml(it.name)}" />
        <div class="tc-name">${escapeHtml(it.name)}${isStrip ? ` · ${it.photoCount} shots` : ''}</div>
        <button class="tc-del">Delete</button>
      </div>
    `).join('');
    grid.querySelectorAll('.tc-del').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const card = e.target.closest('.template-card');
        const cardKind = card.dataset.kind;
        const id = card.dataset.id;
        if (!confirm('Delete this template?')) return;
        await fetch(`/api/${cardKind}/${id}`, { method: 'DELETE' });
        loadTemplates();
      });
    });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  document.getElementById('stripForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const imageFile = fd.get('image');
    if (!imageFile || !imageFile.size) return;
    const imageDataUrl = await fileToDataUrl(imageFile);
    const payload = { imageDataUrl };
    for (const key of ['name', 'width', 'height', 'photoCount', 'marginX', 'marginTop', 'marginBottom', 'gap']) {
      payload[key] = fd.get(key);
    }
    await fetch('/api/strips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    form.reset();
    loadTemplates();
  });

  document.getElementById('frameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const imageFile = fd.get('image');
    if (!imageFile || !imageFile.size) return;
    const imageDataUrl = await fileToDataUrl(imageFile);
    await fetch('/api/frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fd.get('name'), imageDataUrl }),
    });
    form.reset();
    loadTemplates();
  });

  // ---------- Navigation ----------

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
      document.getElementById(`view-${btn.dataset.view}`).classList.remove('hidden');
      if (btn.dataset.view === 'gallery') loadGallery();
    });
  });

  document.querySelectorAll('.ttab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ttab-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      document.querySelectorAll('.ttab-panel').forEach((p) => p.classList.add('hidden'));
      document.getElementById(`panel-${btn.dataset.ttab}`).classList.remove('hidden');
    });
  });

  async function loadGallery() {
    const grid = document.getElementById('galleryGrid');
    const empty = document.getElementById('galleryEmpty');
    const items = await fetch('/api/photos').then((r) => r.json());
    if (!items.length) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    grid.innerHTML = items.map((it, i) => `
      <a href="#" class="gallery-item" data-url="${it.url}">
        <img src="${it.url}" alt="Photo strip" loading="lazy" />
      </a>
    `).join('');
    grid.querySelectorAll('.gallery-item').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        downloadRemote(a.dataset.url, `snapbooth-${Date.now()}.png`);
      });
    });
  }

  async function downloadRemote(url, filename) {
    const res = await fetch(url);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  }

  // ---------- Session ----------

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function loadImage(src) {
    // Fetch-then-objectURL keeps the canvas untainted regardless of the
    // remote host's CORS headers, since object URLs are same-origin.
    const res = await fetch(src);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = objUrl;
      });
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  }

  function buildShotProgress(n) {
    shotProgressEl.innerHTML = Array.from({ length: n }, () => '<span></span>').join('');
  }
  function markShot(i, state) {
    const dots = shotProgressEl.querySelectorAll('span');
    if (dots[i]) dots[i].className = state;
  }

  async function runCountdown(seconds) {
    for (let s = seconds; s >= 1; s--) {
      countdownEl.textContent = s;
      countdownEl.classList.remove('show');
      void countdownEl.offsetWidth;
      countdownEl.classList.add('show');
      await sleep(1000);
    }
  }

  function captureFrame(slot) {
    // Crop the live video into the slot's aspect ratio (cover fit), mirrored to match preview.
    const vw = video.videoWidth, vh = video.videoHeight;
    const targetAspect = slot.w / slot.h;
    let sw = vw, sh = vh, sx = 0, sy = 0;
    const vAspect = vw / vh;
    if (vAspect > targetAspect) {
      sw = vh * targetAspect;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / targetAspect;
      sy = (vh - sh) / 2;
    }
    workCanvas.width = slot.w;
    workCanvas.height = slot.h;
    workCtx.save();
    workCtx.translate(slot.w, 0);
    workCtx.scale(-1, 1);
    workCtx.drawImage(video, sx, sy, sw, sh, 0, 0, slot.w, slot.h);
    workCtx.restore();
    return workCtx.getImageData(0, 0, slot.w, slot.h);
  }

  async function runSession() {
    if (busy) return;
    busy = true;
    startBtn.disabled = true;

    const stripId = stripSelect.value;
    const strip = stripId ? strips.find((s) => s.id === stripId) : DEFAULT_STRIP;
    const frameId = frameSelect.value;
    const frame = frameId ? frames.find((f) => f.id === frameId) : null;
    const frameImg = frame ? await loadImage(frame.url) : null;

    resultActions.classList.add('hidden');
    stripPrint.classList.remove('printing', 'done');
    stripPrint.style.clipPath = 'inset(0 0 100% 0)';
    buildShotProgress(strip.photoCount);

    const shots = [];
    for (let i = 0; i < strip.photoCount; i++) {
      markShot(i, 'active');
      await runCountdown(3);
      flashEl.classList.remove('pop');
      void flashEl.offsetWidth;
      flashEl.classList.add('pop');
      const imgData = captureFrame(strip.slots[i]);
      shots.push(imgData);
      markShot(i, 'done');
      await sleep(400);
    }

    // Composite final strip.
    const outCanvas = document.createElement('canvas');
    outCanvas.width = strip.width;
    outCanvas.height = strip.height;
    const ctx = outCanvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, strip.width, strip.height);

    if (strip.url) {
      const bg = await loadImage(strip.url);
      ctx.drawImage(bg, 0, 0, strip.width, strip.height);
    }

    for (let i = 0; i < strip.photoCount; i++) {
      const slot = strip.slots[i];
      const tmp = document.createElement('canvas');
      tmp.width = slot.w;
      tmp.height = slot.h;
      tmp.getContext('2d').putImageData(shots[i], 0, 0);
      ctx.drawImage(tmp, slot.x, slot.y, slot.w, slot.h);
      if (frameImg) {
        ctx.drawImage(frameImg, slot.x, slot.y, slot.w, slot.h);
      }
    }

    if (!strip.url) {
      ctx.strokeStyle = '#e7e2ea';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, strip.width - 2, strip.height - 2);
      ctx.fillStyle = '#3a3346';
      ctx.font = '600 26px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('snapbooth', strip.width / 2, strip.height - 100);
    }

    const dataUrl = outCanvas.toDataURL('image/png');
    stripImg.src = dataUrl;
    currentStripUrl = dataUrl;

    // "Print" animation: paper slides out of the printer slot.
    await sleep(100);
    stripPrint.classList.add('printing');
    await sleep(2150);
    stripPrint.classList.add('done');

    resultActions.classList.remove('hidden');
    startBtn.disabled = false;
    busy = false;

    fetch('/api/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl }),
    }).catch(() => {});
  }

  startBtn.addEventListener('click', runSession);

  downloadBtn.addEventListener('click', () => {
    if (!currentStripUrl) return;
    const a = document.createElement('a');
    a.href = currentStripUrl;
    a.download = `snapbooth-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  retakeBtn.addEventListener('click', () => {
    resultActions.classList.add('hidden');
    stripPrint.classList.remove('printing', 'done');
    stripPrint.style.clipPath = 'inset(0 0 100% 0)';
    shotProgressEl.innerHTML = '';
  });

  // ---------- Init ----------

  startCamera();
  loadTemplates();
})();
