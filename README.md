# foryoubooth

A photobooth-style web app: live camera preview, a 3-2-1 countdown session, a
composited photo strip that "prints" out with a slide-out animation, and
downloadable results. Strip backgrounds and per-photo overlays are templates
you upload and manage yourself — no code changes needed.

Runs great on a laptop or phone browser. Templates and saved strips are
stored in [Vercel Blob](https://vercel.com/docs/storage/vercel-blob), so they
sync across every device once deployed.

## Deploy to Vercel

1. **Push this repo to GitHub** (see below).
2. On [vercel.com](https://vercel.com), click **Add New → Project** and import the GitHub repo.
3. In the new project, go to **Storage → Create Database → Blob**, create a store, and connect it to the project. Vercel will automatically add a `BLOB_READ_WRITE_TOKEN` environment variable for you.
4. Deploy. No build command or output directory needed — it's a static frontend plus serverless functions under `/api`.

## Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## Local development

1. `npm install`
2. Get a Blob token: in your Vercel project (after step 3 above), run `vercel env pull .env` — or copy `.env.example` to `.env` and paste the `BLOB_READ_WRITE_TOKEN` value from **Project Settings → Environment Variables** on vercel.com.
3. `npm start`
4. Open `http://localhost:4173`. On your phone, use `http://<your-laptop-LAN-IP>:4173` (same Wi-Fi) to test the camera there too.

## How templates work

- **Strip designs** (Templates → Strip designs): upload a full background image for the printed strip. You set the canvas size, how many photos it holds, and the margins/gap — the app works out where each photo slot sits.
- **Photo overlays** (Templates → Photo overlays): upload a transparent PNG (washi tape, border, stamp, logo) drawn on top of every captured photo.

Both are editable and deletable anytime from the Templates tab, and sync across any device you open the deployed app on.
