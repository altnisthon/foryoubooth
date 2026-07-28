const { put, list, del } = require('@vercel/blob');

async function readIndex(pathname) {
  try {
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const match = blobs.find((b) => b.pathname === pathname);
    if (!match) return [];
    // Vercel's CDN can serve a public blob's previous content for a bit
    // after it's overwritten (published propagation can take up to ~60s).
    // The index is small control data queried on every page load, not
    // large media, so freshness matters far more than caching it — a
    // unique query string forces a fresh fetch instead of a stale hit.
    const res = await fetch(`${match.url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function writeIndex(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

function decodeDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { ext: match[1] === 'jpeg' ? 'jpg' : match[1], buffer: Buffer.from(match[2], 'base64') };
}

module.exports = { put, list, del, readIndex, writeIndex, decodeDataUrl };
