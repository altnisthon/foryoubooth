const { put, list, del } = require('@vercel/blob');

async function readIndex(pathname) {
  try {
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const match = blobs.find((b) => b.pathname === pathname);
    if (!match) return [];
    const res = await fetch(match.url, { cache: 'no-store' });
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
  });
}

function decodeDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { ext: match[1] === 'jpeg' ? 'jpg' : match[1], buffer: Buffer.from(match[2], 'base64') };
}

module.exports = { put, list, del, readIndex, writeIndex, decodeDataUrl };
