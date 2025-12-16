# AI Coding Agent Instructions for my-awsome-portfolio

## Project Overview
This is a portfolio site built with **VitePress** (Vue-based static site generator) + **Tailwind CSS**. The architecture separates content (Markdown in `docs/`) from custom Vue components and theming.

## Architecture & Key Components

### Directory Structure
- `docs/` - VitePress source directory (all pages, works, content)
  - `.vitepress/config.mts` - VitePress configuration (base path, nav, etc.)
  - `.vitepress/theme/` - Custom theme components and styling
    - `Layout.vue` - Main page layout (routes to appropriate components)
    - `components/` - Page-specific components (NavBar, WorkPage, AboutPage, etc.)
    - `home-page-components/` - Reusable sections for homepage
    - `styles/` - CSS variables, landing styles, Tailwind integration
  - `.vitepress/images/` - Static assets
  - `index.md`, `about.md` - Root content pages
  - `works/*/index.md` - Individual work portfolio items (dynamically discovered)
- `.github/workflows/deploy.yml` - GitHub Actions deployment pipeline

### Critical Data Flows

**Page Routing & Components** (`Layout.vue`):
- VitePress provides `useRoute()` and `useData()` composables
- Custom routing logic checks `frontmatter.layout` and normalized path to select components:
  - Layout: `home` → `WorkStack` component
  - Path: `/works/*` → `WorkPage` component
  - Path: `/about*` → `AboutPage` component
  - Default → render Markdown with `<Content />` element
- ⚠️ **Important**: Path matching must account for the `base` prefix (GitHub Pages subpath). See `normalizedPath` computed property.

**Works Gallery**:
- Each work lives in `docs/works/{work-name}/index.md`
- `WorkStack` and `WorkPage` components dynamically discover and render works
- Works structure is inferred from filesystem, not explicit config

## Styling & Build System

**Tailwind CSS Setup**:
- Config: `tailwind.config.js` - scans `./docs/**/*.{vue,md,js,ts}` for class detection
- PostCSS: `postcss.config.cjs` - uses `@tailwindcss/postcss` + autoprefixer
- Entry point: `docs/.vitepress/theme/tailwind.css`
- Typography plugin enabled: `@tailwindcss/typography`
- Custom fonts: IBM Plex Sans/Serif loaded from Google Fonts (in config.mts head)

**Theme Assets**:
- Global CSS variables in `docs/.vitepress/theme/styles/vars.css`
- Landing page styles in `docs/.vitepress/theme/styles/landing.css`
- All CSS imported in `index.ts`

## Development Workflow

**Local Development**:
```bash
npm install
npm run docs:dev  # Starts VitePress dev server on http://localhost:5173
```

**Build & Preview** (mimics GitHub Pages static serving):
```bash
npm run docs:build  # Output: docs/.vitepress/dist
npm run docs:preview  # Preview static output locally
```

**Adding Content**:
- New page: Create `.md` file in `docs/` (auto-routed)
- New work: Create `docs/works/{name}/index.md` (discovered by components)
- To apply custom layout: Set `layout: home|about|work` in frontmatter

## Deployment & Configuration

**GitHub Pages Deployment** (via Actions):
- Workflow: `.github/workflows/deploy.yml`
- Job: builds with `npm run docs:build`, deploys `docs/.vitepress/dist` to `gh-pages` branch
- Config: Node 24, npm dependencies cached
- ⚠️ **Critical**: `base` in `config.mts` must match repo name for correct asset paths:
  ```typescript
  base: isProd ? `/${repoName}/` : '/',  // Ensures CSS/JS paths work on GitHub Pages
  ```

## Code Patterns & Conventions

**Vue Component Patterns** (in `docs/.vitepress/theme/`):
- Use `<script setup lang="ts">` with TypeScript
- Leverage VitePress composables: `useData()`, `useRoute()`, `useRouter()`
- Import components from `vitepress` for layout defaults (currently using custom Layout.vue)

**Tailwind Classes**:
- Responsive: use `sm:`, `md:`, `lg:` breakpoints (e.g., `max-w-6xl px-4 sm:px-6 lg:px-8`)
- Prose classes for markdown content: `prose prose-base md:prose-lg` (typography plugin)
- Color scheme: uses stone/neutral palette (e.g., `bg-stone-200`, `text-black`)

**Markdown Integration**:
- Content markdown rendered with `<Content />` component (VitePress default)
- Frontmatter controls layout selection and metadata
- Markdown in `.md` files can use Tailwind classes via HTML/Vue blocks

## Common Pitfalls & Troubleshooting

**404 / Missing CSS on GitHub Pages**:
- Cause: `base` path in `config.mts` doesn't match repo name
- Fix: Update `const repoName = 'my-awsome-portfolio'` if repo is renamed

**Path Matching Fails**:
- Cause: Forgetting to normalize route path when comparing against `base`
- Pattern: Always use `route.path.replace(site.base, '/')` before path matching (see `Layout.vue`)

**Components Not Rendering**:
- Check: Is frontmatter `layout` value correct? Is path matching logic in `Layout.vue` exhaustive?
- Fallback: Default behavior renders Markdown with `<Content />`

## External Dependencies
- **VitePress 1.6.4** - Site generator
- **Tailwind CSS 4.1.17** - Utility styling
- **@tailwindcss/typography 0.5.13** - Markdown prose styling
- **gsap**, **p5**, **three** - Animation/graphics libraries (likely used in hero/sketch components)
- **gh-pages 6.3.0** - Manual deployment alternative (optional)

## References
- VitePress docs: https://vitepress.dev/
- Config reference: https://vitepress.dev/reference/site-config
- Theme customization: https://vitepress.dev/guide/extending-default-theme
