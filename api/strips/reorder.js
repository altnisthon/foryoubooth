const { readIndex, writeIndex } = require('../_blob');
const { isAdminRequest } = require('../_auth');

const INDEX_PATH = 'templates/strips/index.json';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    const { order } = req.body || {};
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order (array of ids) required' });

    const list = await readIndex(INDEX_PATH);
    const byId = new Map(list.map((item) => [item.id, item]));
    const reordered = order.filter((id) => byId.has(id)).map((id) => byId.get(id));
    const seen = new Set(reordered.map((item) => item.id));
    for (const item of list) {
      if (!seen.has(item.id)) reordered.push(item);
    }

    await writeIndex(INDEX_PATH, reordered);
    res.status(200).json(reordered);
  } catch (err) {
    console.error('api/strips/reorder error:', err);
    res.status(500).json({ error: 'storage error', message: err.message });
  }
};
