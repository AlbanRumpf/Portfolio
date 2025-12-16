# my-awsome-portfolio — Project Overview

This repository is a portfolio site built with VitePress (Vue + static site generation) and styled with Tailwind CSS. Content (Markdown pages and works) lives under `docs/` and a custom VitePress theme provides components and layouts.

Key points:
- Content folder: `docs/` (VitePress source)
- VitePress config: `docs/.vitepress/config.mts`
- Theme and components: `docs/.vitepress/theme/`

---

## Features

- Static site generated with VitePress
- Custom theme and Vue components under `docs/.vitepress/theme`
- Tailwind CSS (including typography plugin) for styling
- Works gallery dynamically generated from `docs/works/*/index.md`

---

## Quick Setup
# test

Prerequisites: Node.js (LTS recommended) and npm/yarn.

1. Clone the repo:

```bash
git clone <repository-url>
cd my-awsome-portfolio
```

2. Install dependencies:

```bash
npm install
```

---

## Development

Run the VitePress dev server (serves the site with SPA routing):

```bash
npx vitepress dev docs
# or if you have scripts in package.json: npm run dev
```

Visit the URL printed in the terminal (usually `http://localhost:5173`).

---

## Build & Preview (production/static)

VitePress generates static HTML for each page. To build and preview the generated output locally:

```bash
npx vitepress build docs
npx vitepress serve docs/.vitepress/dist
```

Notes:
- The built files are in `docs/.vitepress/dist`.
- This `serve` command simulates how static hosts (like GitHub Pages) will serve files.

---

## Deployment

You must deploy the *built* output (the `docs/.vitepress/dist` folder), not the raw `docs/` source. If you deploy the repo root or the `docs/` folder as-is, GitHub Pages may serve markdown files directly and not the generated HTML (resulting in missing layout/components and plain MD content).

Two common options:

1) Publish to `gh-pages` branch using `gh-pages` package (manual):

```bash
npm install --save-dev gh-pages
# Add script to package.json: "deploy": "gh-pages -d docs/.vitepress/dist -b gh-pages"
npm run build && npm run deploy
```

2) Automatic GitHub Actions (recommended): create `.github/workflows/deploy.yml` with a job that builds the site and deploys `docs/.vitepress/dist` to `gh-pages` using `peaceiris/actions-gh-pages`.

Example workflow snippet:

```yaml
name: Build and Deploy VitePress

on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npx vitepress build docs
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_branch: gh-pages
          publish_dir: ./docs/.vitepress/dist
```

After the workflow completes, configure GitHub Pages (in repo Settings → Pages) to serve from the `gh-pages` branch.

---

## Base configuration and GH Pages

If you host the site under a repository subpath (e.g. `https://username.github.io/my-awsome-portfolio/`), set the `base` field in `docs/.vitepress/config.mts` appropriately (or make it conditional for dev vs production). This ensures asset and anchor URLs include the repo path and prevents 404s for CSS/HTML on refresh.

Example in `config.mts`:

```js
base: process.env.NODE_ENV === 'production' ? '/my-awsome-portfolio/' : '/',
```

Or use `import.meta.env.BASE_URL` at build time when generating absolute links in components.

---

## Troubleshooting

- If pages load as raw markdown on GitHub Pages, you are likely serving the repo source rather than the built `dist` folder. Deploy the built `docs/.vitepress/dist` instead.
- If CSS 404s occur, confirm `base` matches the site path on the host (e.g. `/my-awsome-portfolio/`).

---

## Resources

- VitePress: https://vitepress.dev/
- Vue: https://vuejs.org/
- Tailwind CSS: https://tailwindcss.com/

---