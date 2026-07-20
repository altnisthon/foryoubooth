# ForYouBoo

A photobooth-style web app with a proper flow: a parallax landing page →
tap **Click to Start** → a full-screen iOS-camera-style capture session
(3-2-1 countdown, 4 shots) → a dedicated result screen where the strip
"prints" out with a slide-out animation. Strip backgrounds and per-photo
overlays are templates you upload and manage yourself — no code changes
needed. Two built-in strip themes (Light and Dark) use the brand's Vanilla
(#FFEBAF) / Moonstone (#4C9DB0) palette.

Runs great on a laptop or phone browser. Templates and saved strips are
stored in [Vercel Blob](https://vercel.com/docs/storage/vercel-blob), so they
sync across every device once deployed.

## Deploy to Vercel

1. **Push this repo to GitHub** (see below).
2. On [vercel.com](https://vercel.com), click **Add New → Project** and import the GitHub repo.
3. In the new project, go to **Storage → Create Database → Blob**, create a store, and connect it to the project. Vercel will automatically add a `BLOB_READ_WRITE_TOKEN` environment variable for you.
4. Go to **Project Settings → Environment Variables** and add `ADMIN_PASSWORD` with a password of your choice (this gates template management and the gallery — see below).
5. Deploy. No build command or output directory needed — it's a static frontend plus serverless functions under `/api`.

`vercel.json` sets `"framework": null` so Vercel treats this as a plain static site + `/api` functions rather than auto-detecting it as an Express app (it would otherwise notice the `express` dependency and try to run a server, which breaks the static frontend).

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
2. Copy `.env.example` to `.env` and fill in:
   - `BLOB_READ_WRITE_TOKEN` — from your Vercel project (after step 3 above), run `vercel env pull .env` or copy the value from **Project Settings → Environment Variables**.
   - `ADMIN_PASSWORD` — any password you want to use locally.
3. `npm run dev`
4. Open `http://localhost:4173`. On your phone, use `http://<your-laptop-LAN-IP>:4173` (same Wi-Fi) to test the camera there too.

## Owner access (Templates + Gallery)

Regular visitors only ever see the landing page and the photo-taking flow — take photos, download the strip, done. Managing templates and browsing past strips is locked to you:

1. Visit your site with `?admin=1` appended, e.g. `https://yourapp.vercel.app/?admin=1`.
2. Enter the `ADMIN_PASSWORD` you set in Vercel.
3. Once unlocked, the **Gallery** and **Templates** tabs appear and stay unlocked on that browser (saved in `localStorage`) until you clear site data or the password changes.

The password is also enforced server-side on every template upload/delete and gallery read, so even a technical visitor can't reach those without it — the hidden tabs are just the UI layer on top.

## How templates work

- **Strip designs** (Templates → Strip designs): upload a full background image for the printed strip. You set the canvas size, how many photos it holds, and the margins/gap — the app works out where each photo slot sits.
- **Photo overlays** (Templates → Photo overlays): upload a transparent PNG (washi tape, border, stamp, logo) drawn on top of every captured photo.

Both are editable and deletable anytime from the Templates tab, and sync across any device you open the deployed app on.
