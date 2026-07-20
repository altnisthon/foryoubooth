const crypto = require('crypto');
const { put, readIndex, writeIndex, decodeDataUrl } = require('./_blob');

const INDEX_PATH = 'templates/frames/index.json';

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const list = await readIndex(INDEX_PATH);
    return res.status(200).json(list);
  }

  if (req.method === 'POST') {
    const { name, imageDataUrl } = req.body || {};
    const decoded = decodeDataUrl(imageDataUrl);
    if (!decoded) return res.status(400).json({ error: 'imageDataUrl (png/jpeg) required' });

    const frameId = crypto.randomBytes(6).toString('hex');
    const blob = await put(`templates/frames/${frameId}.${decoded.ext}`, decoded.buffer, {
      access: 'public',
      contentType: `image/${decoded.ext === 'jpg' ? 'jpeg' : decoded.ext}`,
      addRandomSuffix: false,
    });

    const list = await readIndex(INDEX_PATH);
    const entry = {
      id: frameId,
      name: (name || 'Untitled overlay').slice(0, 60),
      url: blob.url,
      createdAt: Date.now(),
    };
    list.unshift(entry);
    await writeIndex(INDEX_PATH, list);
    return res.status(200).json(entry);
  }

  res.status(405).json({ error: 'method not allowed' });
};
