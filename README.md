# Nimzo website

Static marketing site for Nimzo. No framework and no runtime JavaScript.

## Structure

| Path | Purpose |
| --- | --- |
| `index.src.html` | Page source with inlined CSS (edit this) |
| `build.mjs` | Minifies the page and copies assets into `dist/` |
| `fonts/` | Self-hosted Geist and Geist Mono (Latin subset, woff2) |
| `vercel.json` | Build settings, cache lifetimes, security headers and CSP |
| `og.png`, `favicon.svg` | Social preview image and icon |

## Develop

```bash
npm install
npm run build
npm run dev
```

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, choose Add New, Project, and import the repository.
3. Keep the detected settings. `vercel.json` sets the build command to `npm run build` and the output directory to `dist`.
4. Add the production domain, then replace `https://nimzo.com` in `index.src.html`, `robots.txt` and `sitemap.xml` with it.

## Before launch

- The Log in and Sign up buttons point to `https://app.nimzo.com/login` and `https://app.nimzo.com/signup`. Change them in `index.src.html` if the app lives elsewhere.
- Replace `https://nimzo.com` with the real domain (canonical, Open Graph image, sitemap).
- If you later add scripts, images from other hosts or analytics, widen the Content-Security-Policy in `vercel.json`.
