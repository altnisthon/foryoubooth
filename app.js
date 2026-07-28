(() => {
  const topbar = document.getElementById('topbar');
  const video = document.getElementById('video');
  const liveOverlayEl = document.getElementById('liveOverlay');
  const workCanvas = document.getElementById('workCanvas');
  const workCtx = workCanvas.getContext('2d');
  const flashEl = document.getElementById('flash');
  const countdownEl = document.getElementById('countdown');
  const shotProgressEl = document.getElementById('shotProgress');
  const startBtn = document.getElementById('startBtn');
  const stripSelect = document.getElementById('stripSelect');
  const frameSelect = document.getElementById('frameSelect');
  const switchCamBtn = document.getElementById('switchCamBtn');
  const backToLandingBtn = document.getElementById('backToLandingBtn');
  const enterBoothBtn = document.getElementById('enterBoothBtn');
  const resultHomeBtn = document.getElementById('resultHomeBtn');

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

  const LAST_STRIP_KEY = 'foryouboo_last_strip';
  const LAST_FRAME_KEY = 'foryouboo_last_frame';

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
      showView('templates');
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
    showView('landing');
    alert('Owner session expired or password changed. Reopen with ?admin=1 to unlock again.');
  }

  function adminFetch(url, opts = {}) {
    const headers = { ...(opts.headers || {}), 'x-admin-password': adminPw || '' };
    return fetch(url, { ...opts, headers });
  }

  if (isAdmin()) revealAdminTabs();

  // ---------- View navigation ----------

  const BOOTH_VIEWS = new Set(['landing', 'camera', 'result']);

  function showView(name) {
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    document.getElementById(`view-${name}`).classList.remove('hidden');
    topbar.classList.toggle('hidden', name === 'landing');
    document.querySelectorAll('.tab-btn').forEach((b) => {
      const match = b.dataset.view === name || (b.dataset.view === 'landing' && BOOTH_VIEWS.has(name));
      b.classList.toggle('is-active', match);
    });
    if (name === 'gallery') loadGallery();
  }

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view === 'landing') {
        showView('landing');
      } else {
        showView(btn.dataset.view);
      }
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

  // Shows the selected photo overlay live on top of the camera feed while
  // posing/shooting, not just baked into the final photo after the fact.
  function updateLiveOverlay() {
    const frameId = frameSelect.value;
    const frame = frameId ? frames.find((f) => f.id === frameId) : null;
    if (frame) {
      liveOverlayEl.src = frame.url;
      liveOverlayEl.classList.remove('hidden');
    } else {
      liveOverlayEl.removeAttribute('src');
      liveOverlayEl.classList.add('hidden');
    }
  }
  frameSelect.addEventListener('change', () => {
    localStorage.setItem(LAST_FRAME_KEY, frameSelect.value);
    updateLiveOverlay();
  });

  // ---------- Camera framing (matches the crop captureFrame() takes) ----------

  const cameraFrameBox = document.getElementById('cameraFrameBox');
  const cameraFrameEl = document.querySelector('.camera-frame');

  function fitCameraFrame() {
    const slot = getSelectedStrip().slots[0];
    const ratio = slot.w / slot.h;
    const vw = cameraFrameEl.clientWidth, vh = cameraFrameEl.clientHeight;
    let w = vh * ratio, h = vh;
    if (w > vw) { w = vw; h = vw / ratio; }
    cameraFrameBox.style.width = `${w}px`;
    cameraFrameBox.style.height = `${h}px`;
  }
  window.addEventListener('resize', () => {
    if (!document.getElementById('view-camera').classList.contains('hidden')) fitCameraFrame();
  });

  enterBoothBtn.addEventListener('click', () => {
    showView('camera');
    startCamera();
    fitCameraFrame();
    updateLiveOverlay();
    shotProgressEl.innerHTML = '';
    startBtn.disabled = false;
  });

  backToLandingBtn.addEventListener('click', () => showView('landing'));
  resultHomeBtn.addEventListener('click', () => showView('landing'));

  if (new URLSearchParams(location.search).get('admin') === '1') {
    history.replaceState(null, '', location.pathname);
    showView('landing');
    openAuthModal();
  }

  // ---------- Parallax ----------

  const scrollStripEl = document.getElementById('scrollStrip');

  function initParallax() {
    // The landing section is a sticky-pinned 100vh view (see .landing-pin),
    // so the background and stickers stay perfectly still on scroll — only
    // the strip's clip-path reveal (updateStripClip) responds to it.
    let ticking = false;
    function apply() {
      updateStripClip();
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(apply);
        ticking = true;
      }
    }, { passive: true });
    apply();

    // Subtle mouse-tilt on desktop for a bit of depth/delight (unrelated to
    // scroll — the layers themselves don't move on scroll anymore).
    const layers = document.querySelectorAll('.landing-bg, .sticker');
    const hero = document.querySelector('.landing-pin');
    if (hero && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      hero.addEventListener('mousemove', (e) => {
        const rect = hero.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width - 0.5;
        const relY = (e.clientY - rect.top) / rect.height - 0.5;
        layers.forEach((el, i) => {
          const strength = (i + 1) * 6;
          el.style.setProperty('--parallax-x', `${relX * strength}px`);
          el.style.setProperty('--parallax-tilt-y', `${relY * strength}px`);
        });
      });
    }
  }

  // ---------- Landing strip preview (scroll-reveal placeholder) ----------
  //
  // Reflects whichever design is chosen in the "Strip design" picker: the
  // built-in Light/Dark placeholder card, or a custom template uploaded via
  // Templates → Strip designs (shown as the owner's actual uploaded image).

  function renderStripPreview() {
    if (!scrollStripEl) return;
    const strip = getSelectedStrip();
    scrollStripEl.classList.remove('strip-card--light', 'strip-card--dark', 'strip-card--custom');

    if (strip.url) {
      scrollStripEl.classList.add('strip-card--custom');
      scrollStripEl.style.aspectRatio = `${strip.width} / ${strip.height}`;
      scrollStripEl.innerHTML = `<img class="strip-card-custom-img" src="${strip.url}" alt="" />`;
    } else {
      const isDark = strip.theme === 'dark';
      scrollStripEl.classList.add(isDark ? 'strip-card--dark' : 'strip-card--light');
      scrollStripEl.style.aspectRatio = '591 / 1772';
      const logoSrc = isDark ? 'assets/logo.png' : 'assets/logo-dark.png';
      const slotsHtml = Array.from({ length: strip.photoCount || 4 }, () => '<div class="strip-card-slot"></div>').join('');
      scrollStripEl.innerHTML =
        `<img class="strip-card-logo" src="${logoSrc}" alt="" />` +
        `<div class="strip-card-slots">${slotsHtml}</div>` +
        `<img class="strip-card-logo" src="${logoSrc}" alt="" />`;
    }
    updateStripClip();
  }

  // Measures where each photo slot actually sits (from the uploaded
  // template's own slot data, or by measuring the built-in card's rendered
  // DOM) so the reveal snaps exactly on slot boundaries regardless of
  // viewport size or template proportions.
  function computeTopHideStops() {
    const buffer = 0.02;
    const strip = getSelectedStrip();

    if (strip.url && Array.isArray(strip.slots) && strip.slots.length && strip.height) {
      const stops = [1];
      for (let i = strip.slots.length - 1; i >= 0; i--) {
        const frac = strip.slots[i].y / strip.height;
        stops.push(Math.max(0, frac - buffer));
      }
      stops[stops.length - 1] = 0;
      return stops;
    }

    if (!scrollStripEl) return [1, 0];
    const slots = scrollStripEl.querySelectorAll('.strip-card-slot');
    if (!slots.length) return [1, 0];
    const cardRect = scrollStripEl.getBoundingClientRect();
    if (cardRect.height <= 0) return [1, 0];
    const stops = [1];
    for (let i = slots.length - 1; i >= 0; i--) {
      const slotRect = slots[i].getBoundingClientRect();
      const frac = (slotRect.top - cardRect.top) / cardRect.height;
      stops.push(Math.max(0, frac - buffer));
    }
    stops[stops.length - 1] = 0;
    return stops;
  }

  function updateStripClip() {
    if (!scrollStripEl) return;
    // Tied to raw scroll distance (not viewport position) so the strip
    // always starts tucked into the slot at the top of the page and only
    // dispenses once the user actually scrolls, however tall the layout is.
    // Reveal snaps whole-slot-by-whole-slot (like paper actually advancing
    // out of a photobooth slot) instead of a smooth continuous slide that
    // would cut through a photo mid-frame. It comes out bottom-first: the
    // bottom slot appears whole, then the next one up, and so on — the top
    // stays tucked in the slot until the very end.
    const REVEAL_DISTANCE = 420;
    const progress = Math.min(1, Math.max(0, window.scrollY / REVEAL_DISTANCE));
    const stops = computeTopHideStops();
    const steps = stops.length - 1;
    const stepIndex = progress <= 0 ? 0 : Math.min(steps, Math.ceil(progress * steps));
    const topHide = stops[stepIndex];
    scrollStripEl.style.clipPath = `inset(${topHide * 100}% 0 0 0)`;
  }

  stripSelect.addEventListener('change', () => {
    localStorage.setItem(LAST_STRIP_KEY, stripSelect.value);
    renderStripPreview();
  });

  // ---------- Built-in strip themes (Vanilla / Moonstone) ----------

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

  const BUILTIN_BASE = { width: 640, height: 2000, photoCount: 4 };
  const BUILTIN_STRIPS = {
    light: { id: '__light', name: 'ForYouBoo · Light', theme: 'light', url: null, ...BUILTIN_BASE, slots: computeSlots(BUILTIN_BASE) },
    dark: { id: '__dark', name: 'ForYouBoo · Dark', theme: 'dark', url: null, ...BUILTIN_BASE, slots: computeSlots(BUILTIN_BASE) },
  };

  let strips = [];
  let frames = [];
  let currentStream = null;
  let facingMode = 'user';
  let busy = false;
  let currentStripUrl = null;

  function getSelectedStrip() {
    const id = stripSelect.value;
    if (id === '__dark') return BUILTIN_STRIPS.dark;
    if (id && id !== '__light') return strips.find((s) => s.id === id) || BUILTIN_STRIPS.light;
    return BUILTIN_STRIPS.light;
  }

  // ---------- Classic strip rendering (pastel gradient + minimal camera-icon placeholders) ----------

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

  function drawCameraIcon(ctx, cx, cy, size, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, size * 0.06);
    const bodyW = size, bodyH = size * 0.62;
    const x = cx - bodyW / 2, y = cy - bodyH / 2 + size * 0.1;
    roundedRectPath(ctx, x, y, bodyW, bodyH, size * 0.14);
    ctx.stroke();
    const bw = size * 0.34, bh = size * 0.16;
    roundedRectPath(ctx, cx - bw / 2, y - bh * 0.75, bw, bh, size * 0.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, y + bodyH / 2, size * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlaceholderSlot(ctx, slot, isDark) {
    ctx.save();
    roundedRectPath(ctx, slot.x, slot.y, slot.w, slot.h, 14);
    ctx.clip();
    const g = ctx.createLinearGradient(slot.x, slot.y, slot.x + slot.w, slot.y + slot.h);
    if (isDark) {
      g.addColorStop(0, '#3b7d8f');
      g.addColorStop(1, '#245261');
    } else {
      g.addColorStop(0, '#fff6de');
      g.addColorStop(1, '#cde9ee');
    }
    ctx.fillStyle = g;
    ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
    const iconColor = isDark ? '#ffebaf' : '#2c6373';
    drawCameraIcon(ctx, slot.x + slot.w / 2, slot.y + slot.h / 2, Math.min(slot.w, slot.h) * 0.34, iconColor, 0.55);
    ctx.restore();
  }

  async function composeClassicCanvas(strip, shots, frameImg) {
    const canvas = document.createElement('canvas');
    canvas.width = strip.width;
    canvas.height = strip.height;
    const ctx = canvas.getContext('2d');
    const isDark = strip.theme === 'dark';

    const bg = ctx.createLinearGradient(0, 0, strip.width, strip.height);
    if (isDark) {
      bg.addColorStop(0, '#2c6373');
      bg.addColorStop(1, '#4c9db0');
    } else {
      bg.addColorStop(0, '#fff6de');
      bg.addColorStop(1, '#ffebaf');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, strip.width, strip.height);

    await ensureBrandFont();
    const ink = isDark ? '#fff6de' : '#2c6373';
    ctx.fillStyle = ink;
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
        drawPlaceholderSlot(ctx, slot, isDark);
      }
      if (frameImg) {
        ctx.drawImage(frameImg, slot.x, slot.y, slot.w, slot.h);
      }
    }

    ctx.fillStyle = ink;
    ctx.font = '800 30px "Baloo 2", sans-serif';
    ctx.fillText('ForYouBoo', strip.width / 2, strip.height - 42);

    return canvas;
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

  // ---------- Template loading ----------

  async function loadTemplates() {
    const [stripsRes, framesRes] = await Promise.all([
      fetch('/api/strips').then((r) => r.json()),
      fetch('/api/frames').then((r) => r.json()),
    ]);
    strips = stripsRes;
    frames = framesRes;

    stripSelect.innerHTML =
      '<option value="__light">ForYouBoo · Light</option>' +
      '<option value="__dark">ForYouBoo · Dark</option>' +
      strips.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    frameSelect.innerHTML = '<option value="">None</option>' +
      frames.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');

    // Whatever you picked last time is remembered as the default going
    // forward, so a custom uploaded overlay/strip stays selected without
    // having to re-pick it every visit — no need to bake anything in.
    const lastStrip = localStorage.getItem(LAST_STRIP_KEY);
    if (lastStrip && [...stripSelect.options].some((o) => o.value === lastStrip)) {
      stripSelect.value = lastStrip;
    }
    const lastFrame = localStorage.getItem(LAST_FRAME_KEY);
    if (lastFrame && [...frameSelect.options].some((o) => o.value === lastFrame)) {
      frameSelect.value = lastFrame;
    }

    renderTemplateGrid('stripGrid', strips, 'strips', true);
    renderTemplateGrid('frameGrid', frames, 'frames', false);
    renderStripPreview();
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

  // Vercel's serverless functions hard-cap the request body at 4.5MB, and a
  // base64 data URL is ~37% bigger than the raw file — a normal phone photo
  // (often 3-10MB) blows past that easily. Resizing/re-encoding client-side
  // before upload keeps templates well under that ceiling. PNG overlays keep
  // their format (transparency matters); strip backgrounds convert to JPEG
  // since they don't need alpha and compress far better.
  function resizeImageToDataUrl(file, { maxDim = 1800, mimeType = 'image/jpeg', quality = 0.85 } = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL(mimeType, quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleTemplateUploadError(res, form) {
    let message = `Upload failed (${res.status}).`;
    try {
      const body = await res.json();
      if (body && body.message) message += ` ${body.message}`;
      else if (body && body.error) message += ` ${body.error}`;
    } catch {
      // response wasn't JSON; keep the generic message
    }
    alert(message);
  }

  document.getElementById('stripForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const imageFile = fd.get('image');
    if (!imageFile || !imageFile.size) return;
    const imageDataUrl = await resizeImageToDataUrl(imageFile, { maxDim: 1800, mimeType: 'image/jpeg', quality: 0.85 });
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
    if (!res.ok) return handleTemplateUploadError(res, form);
    form.reset();
    loadTemplates();
  });

  document.getElementById('frameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const imageFile = fd.get('image');
    if (!imageFile || !imageFile.size) return;
    const imageDataUrl = await resizeImageToDataUrl(imageFile, { maxDim: 1600, mimeType: 'image/png' });
    const res = await adminFetch('/api/frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fd.get('name'), imageDataUrl }),
    });
    if (res.status === 401) return handleAdminUnauthorized();
    if (!res.ok) return handleTemplateUploadError(res, form);
    form.reset();
    loadTemplates();
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
    grid.innerHTML = items.map((it) => `
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

    const strip = getSelectedStrip();
    const frameId = frameSelect.value;
    const frame = frameId ? frames.find((f) => f.id === frameId) : null;
    const frameImg = frame ? await loadImage(frame.url) : null;

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

    showView('result');
    resultActions.classList.add('hidden');
    stripPrint.classList.remove('idle', 'printing', 'done');
    stripPrint.style.clipPath = 'inset(0 0 100% 0)';

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
    showView('camera');
    startCamera();
    fitCameraFrame();
  });

  // ---------- Init ----------

  showView('landing');
  initParallax();
  loadTemplates();
})();
