// Local development server only. In production this app deploys to Vercel,
// where the files under /api become serverless functions automatically and
// the root-level static files are served directly — this file isn't used there.
require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4173;

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.warn(
    'Warning: BLOB_READ_WRITE_TOKEN is not set. Copy .env.example to .env and fill it in ' +
    '(see README for how to get this from your Vercel project).'
  );
}

app.use(express.json({ limit: '25mb' }));

app.use(express.static(__dirname, { index: 'index.html' }));

function withParamAsQuery(handler) {
  return (req, res) => {
    req.query = { ...req.query, ...req.params };
    return handler(req, res);
  };
}

app.all('/api/frames', require('./api/frames'));
app.all('/api/frames/:id', withParamAsQuery(require('./api/frames/[id]')));
app.all('/api/strips', require('./api/strips'));
app.all('/api/strips/:id', withParamAsQuery(require('./api/strips/[id]')));
app.all('/api/photos', require('./api/photos'));

app.listen(PORT, () => {
  console.log(`Snapbooth dev server running at http://localhost:${PORT}`);
});
