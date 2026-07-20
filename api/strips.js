const crypto = require('crypto');
const { put, readIndex, writeIndex, decodeDataUrl } = require('./_blob');

const INDEX_PATH = 'templates/strips/index.json';

function computeSlots({ width, height, photoCount, marginX, marginTop, marginBottom, gap }) {
  const slotW = width - marginX * 2;
  const availableH = height - marginTop - marginBottom - gap * (photoCount - 1);
  const slotH = Math.max(10, Math.floor(availableH / photoCount));
  const slots = [];
  for (let i = 0; i < photoCount; i++) {
    slots.push({ x: marginX, y: marginTop + i * (slotH + gap), w: slotW, h: slotH });
  }
  return slots;
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const list = await readIndex(INDEX_PATH);
    return res.status(200).json(list);
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const decoded = decodeDataUrl(body.imageDataUrl);
    if (!decoded) return res.status(400).json({ error: 'imageDataUrl (png/jpeg) required' });

    const cfg = {
      width: Math.max(100, parseInt(body.width, 10) || 600),
      height: Math.max(100, parseInt(body.height, 10) || 1800),
      photoCount: Math.min(6, Math.max(1, parseInt(body.photoCount, 10) || 3)),
      marginX: Math.max(0, parseInt(body.marginX, 10) || 40),
      marginTop: Math.max(0, parseInt(body.marginTop, 10) || 40),
      marginBottom: Math.max(0, parseInt(body.marginBottom, 10) || 220),
      gap: Math.max(0, parseInt(body.gap, 10) || 24),
    };
    const slots = computeSlots(cfg);

    const stripId = crypto.randomBytes(6).toString('hex');
    const blob = await put(`templates/strips/${stripId}.${decoded.ext}`, decoded.buffer, {
      access: 'public',
      contentType: `image/${decoded.ext === 'jpg' ? 'jpeg' : decoded.ext}`,
      addRandomSuffix: false,
    });

    const list = await readIndex(INDEX_PATH);
    const entry = {
      id: stripId,
      name: (body.name || 'Untitled strip').slice(0, 60),
      url: blob.url,
      width: cfg.width,
      height: cfg.height,
      photoCount: cfg.photoCount,
      slots,
      createdAt: Date.now(),
    };
    list.unshift(entry);
    await writeIndex(INDEX_PATH, list);
    return res.status(200).json(entry);
  }

  res.status(405).json({ error: 'method not allowed' });
};
