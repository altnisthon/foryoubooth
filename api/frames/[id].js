const { del, readIndex, writeIndex } = require('../_blob');
const { isAdminRequest } = require('../_auth');

const INDEX_PATH = 'templates/frames/index.json';

module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'method not allowed' });
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    const { id } = req.query;
    const list = await readIndex(INDEX_PATH);
    const entry = list.find((f) => f.id === id);
    if (!entry) return res.status(404).json({ error: 'not found' });

    await del(entry.url);
    await writeIndex(INDEX_PATH, list.filter((f) => f.id !== id));
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('api/frames/[id] error:', err);
    res.status(500).json({ error: 'storage error', message: err.message });
  }
};
