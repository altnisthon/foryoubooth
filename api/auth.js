const { isAdminRequest } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { password } = req.body || {};
  if (isAdminRequest({ headers: { 'x-admin-password': password } })) {
    return res.status(200).json({ ok: true });
  }
  res.status(401).json({ ok: false, error: 'incorrect password' });
};
