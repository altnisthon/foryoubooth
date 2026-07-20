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

  const authModal = document.getElementById('authModal');
  const authPasswordInput = document.getElementById('authPasswordInput');
  const authError = document.getElementById('authError');
  const authCancelBtn = document.getElementById('authCancelBtn');
  const authSubmitBtn = document.getElementById('authSubmitBtn');

  // ---------- Owner access ----------

  const AUTH_STORAGE_KEY = 'foryouboo_admin_pw';
  let adminPw = localStorage.getItem(AUTH_STORAGE_KEY) || null;

  function isAdmin() { return !!adminPw; }

  function revealAdminTabs() {
    document.querySelectorAll('.admin-tab').forEach((b) => b.classList.remove('hidden'));
  }

  function openAuthModal() {
    authError.classList.add('hidden');
    authPasswordInput.value = '';
    authModal.classList.remove('hidden');
    authPasswordInput.focus();
  }
  function closeAuthModal() {
    authModal.classList.add('hidden');
  }

  async function trySubmitAuth() {
    const pw = authPasswordInput.value;
    if (!pw) return;
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      adminPw = pw;
      localStorage.setItem(AUTH_STORAGE_KEY, pw);
      revealAdminTabs();
      closeAuthModal();
      const templatesTab = document.querySelector('.tab-btn[data-view="templates"]');
      if (templatesTab) templatesTab.click();
    } else {
      authError.classList.remove('hidden');
    }
  }

  authSubmitBtn.addEventListener('click', trySubmitAuth);
  authCancelBtn.addEventListener('click', closeAuthModal);
  authPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') trySubmitAuth();
  });

  function handleAdminUnauthorized() {
    adminPw = null;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    document.querySelectorAll('.admin-tab').forEach((b) => b.classList.add('hidden'));
    const boothTab = document.querySelector('.tab-btn[data-view="booth"]');
    if (boothTab) boothTab.click();
    alert('Owner session expired or password changed. Reopen with ?admin=1 to unlock again.');
  }

  function adminFetch(url, opts = {}) {
    const headers = { ...(opts.headers || {}), 'x-admin-password': adminPw || '' };
    return fetch(url, { ...opts, headers });
  }

  if (isAdmin()) revealAdminTabs();
  if (new URLSearchParams(location.search).get('admin') === '1') {
    history.replaceState(null, '', location.pathname);
    openAuthModal();
  }

  const DEFAULT_STRIP = {
    id: '',
    name: 'Classic',
    url: null,
    width: 640,
    height: 2000,
    photoCount: 4,
    slots: null, // computed below
  };

  let strips = [];
  let frames = [];
  let currentStream = null;
  let facingMode = 'user';
  let busy = false;
  let currentStripUrl = null;

  function computeSlots(cfg) {
    const marginX = 40, marginTop = 110, marginBottom = 130, gap = 20;
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

  // ---------- Classic strip rendering (pastel gradient + illustrated placeholders) ----------

  async function ensureBrandFont() {
    try {
      await Promise.all([
        document.fonts.load('800 34px "Baloo 2"'),
        document.fonts.load('800 30px "Baloo 2"'),
      ]);
    } catch {
      // Font failed to load in time; canvas text will fall back silently.
    }
  }

  function roundedRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawCloud(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx - r * 0.6, cy, r * 0.6, 0, Math.PI * 2);
    ctx.arc(cx, cy - r * 0.3, r * 0.75, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.65, cy, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHill(ctx, x, y, w, h, baseFrac, waveFrac) {
    const baseY = y + h * baseFrac;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, baseY + h * waveFrac * 0.3);
    ctx.bezierCurveTo(
      x + w * 0.25, baseY - h * waveFrac,
      x + w * 0.5, baseY + h * waveFrac,
      x + w * 0.78, baseY - h * waveFrac * 0.4
    );
    ctx.bezierCurveTo(
      x + w * 0.9, baseY - h * waveFrac * 0.7,
      x + w * 0.97, baseY,
      x + w, baseY + h * waveFrac * 0.2
    );
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
  }

  function drawPlaceholderScene(ctx, x, y, w, h) {
    ctx.save();
    roundedRectPath(ctx, x, y, w, h, 14);
    ctx.clip();

    const sky = ctx.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, '#bfe3fb');
    sky.addColorStop(1, '#eef8ff');
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = '#ffffff';
    drawCloud(ctx, x + w * 0.16, y + h * 0.22, w * 0.075);
    drawCloud(ctx, x + w * 0.52, y + h * 0.17, w * 0.13);

    ctx.fillStyle = '#c7e28a';
    drawHill(ctx, x, y, w, h, 0.62, 0.12);
    ctx.fillStyle = '#8fbf2f';
    drawHill(ctx, x, y, w, h, 0.74, 0.16);

    ctx.restore();
  }

  async function composeClassicCanvas(strip, shots, frameImg) {
    const canvas = document.createElement('canvas');
    canvas.width = strip.width;
    canvas.height = strip.height;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, strip.width, strip.height);
    bg.addColorStop(0, '#ffe3ea');
    bg.addColorStop(0.5, '#fff3e6');
    bg.addColorStop(1, '#efe6fb');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, strip.width, strip.height);

    await ensureBrandFont();
    ctx.fillStyle = '#4a2f42';
    ctx.textAlign = 'center';
    ctx.font = '800 34px "Baloo 2", sans-serif';
    ctx.fillText('ForYouBoo', strip.width / 2, 60);

    for (let i = 0; i < strip.photoCount; i++) {
      const slot = strip.slots[i];
      const shot = shots && shots[i];
      if (shot) {
        const tmp = document.createElement('canvas');
        tmp.width = slot.w;
        tmp.height = slot.h;
        tmp.getContext('2d').putImageData(shot, 0, 0);
        ctx.save();
        roundedRectPath(ctx, slot.x, slot.y, slot.w, slot.h, 14);
        ctx.clip();
        ctx.drawImage(tmp, slot.x, slot.y, slot.w, slot.h);
        ctx.restore();
      } else {
        drawPlaceholderScene(ctx, slot.x, slot.y, slot.w, slot.h);
      }
      if (frameImg) {
        ctx.drawImage(frameImg, slot.x, slot.y, slot.w, slot.h);
      }
    }

    ctx.fillStyle = '#4a2f42';
    ctx.font = '800 30px "Baloo 2", sans-serif';
    ctx.fillText('ForYouBoo', strip.width / 2, strip.height - 42);

    return canvas;
  }

  async function renderIdlePreview() {
    const stripId = stripSelect.value;
    const strip = stripId ? strips.find((s) => s.id === stripId) : DEFAULT_STRIP;
    const frameId = frameSelect.value;
    const frame = frameId ? frames.find((f) => f.id === frameId) : null;

    let canvas;
    try {
      const frameImg = frame ? await loadImage(frame.url) : null;
      if (strip.url) {
        const img = await loadImage(strip.url);
        canvas = document.createElement('canvas');
        canvas.width = strip.width;
        canvas.height = strip.height;
        canvas.getContext('2d').drawImage(img, 0, 0, strip.width, strip.height);
      } else {
        canvas = await composeClassicCanvas(strip, null, frameImg);
      }
    } catch {
      return;
    }

    stripImg.src = canvas.toDataURL('image/png');
    stripPrint.classList.remove('printing', 'done');
    stripPrint.classList.add('idle');
    stripPrint.style.clipPath = 'inset(0 0 0 0)';
  }

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

  stripSelect.addEventListener('change', renderIdlePreview);
  frameSelect.addEventListener('change', renderIdlePreview);

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
    renderIdlePreview();
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
        const res = await adminFetch(`/api/${cardKind}/${id}`, { method: 'DELETE' });
        if (res.status === 401) return handleAdminUnauthorized();
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
    const res = await adminFetch('/api/strips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) return handleAdminUnauthorized();
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
    const res = await adminFetch('/api/frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fd.get('name'), imageDataUrl }),
    });
    if (res.status === 401) return handleAdminUnauthorized();
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
    const res = await adminFetch('/api/photos');
    if (res.status === 401) return handleAdminUnauthorized();
    const items = await res.json();
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
        downloadRemote(a.dataset.url, `foryouboo-${Date.now()}.png`);
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
    stripPrint.classList.remove('idle', 'printing', 'done');
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
    let outCanvas;
    if (strip.url) {
      outCanvas = document.createElement('canvas');
      outCanvas.width = strip.width;
      outCanvas.height = strip.height;
      const ctx = outCanvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, strip.width, strip.height);

      const bg = await loadImage(strip.url);
      ctx.drawImage(bg, 0, 0, strip.width, strip.height);

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
    } else {
      outCanvas = await composeClassicCanvas(strip, shots, frameImg);
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
    a.download = `foryouboo-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  retakeBtn.addEventListener('click', () => {
    resultActions.classList.add('hidden');
    shotProgressEl.innerHTML = '';
    renderIdlePreview();
  });

  // ---------- Init ----------

  startCamera();
  loadTemplates();
})();
