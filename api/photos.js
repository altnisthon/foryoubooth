const { put, list, decodeDataUrl } = require('./_blob');
const { isAdminRequest } = require('./_auth');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (!isAdminRequest(req)) return res.status(401).json({ error: 'unauthorized' });

      const { blobs } = await list({ prefix: 'photos/', limit: 60 });
      const items = blobs
        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
        .map((b) => ({ url: b.url, uploadedAt: b.uploadedAt }));
      return res.status(200).json(items);
    }

    if (req.method === 'POST') {
      const decoded = decodeDataUrl((req.body || {}).dataUrl);
      if (!decoded) return res.status(400).json({ error: 'dataUrl (png/jpeg) required' });

      const blob = await put(`photos/strip-${Date.now()}.${decoded.ext}`, decoded.buffer, {
        access: 'public',
        contentType: `image/${decoded.ext === 'jpg' ? 'jpeg' : decoded.ext}`,
        addRandomSuffix: false,
      });
      return res.status(200).json({ ok: true, url: blob.url });
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('api/photos error:', err);
    res.status(500).json({ error: 'storage error', message: err.message });
  }
};
