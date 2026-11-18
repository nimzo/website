# Nimzo website

Astro static site, deployed on Vercel.

| Path | Purpose |
| --- | --- |
| `src/pages/` | Astro routes: `/`, `/blog`, `404` |
| `src/html/` | Page markup (exported HTML), rendered verbatim by the pages |
| `public/` | Static assets: `_ploy_static/` bundles, robots, sitemaps, llms.txt, fonts, icons |
| `api/form-submit.js` | Vercel function for the waitlist/demo form (`/_ploy/form-submit` is rewritten to it) |
| `vercel.json` | Framework, rewrites, cache lifetimes, security headers and CSP |

## Develop

```bash
npm install
npm run dev
npm run build
```

## Deploy to Vercel

Import the repo in Vercel. Astro is auto-detected (`astro build`, output `dist`).

Set `FORM_WEBHOOK_URL` in the Vercel project settings: a webhook that accepts the JSON `{ formName, pageUrl, data, receivedAt }`. Without it the form returns an error.

## Notes

- The pages still load the exported, pre-built client bundles in `public/_ploy_static/_astro/`. When editing those, rename the file (new hash) and update the references, so browsers fetch the new copy.
- `https://nimzo.com` is set as `site` in `astro.config.mjs` and appears in the HTML, sitemaps and robots.txt. Replace it if the domain differs.
- If you add scripts or assets from other hosts, widen the Content-Security-Policy in `vercel.json`.
