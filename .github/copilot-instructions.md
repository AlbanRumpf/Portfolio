## Project-Specific Guidance

### Work Parsing
Ensure that all works are properly structured in the `docs/installations/` directory.

### Cover Image Naming
Use the filename pattern `cover.{jpg,jpeg,png,webp}` (place the file in the same work folder as `index.md`).

### Base Note
Include a base note in each work's frontmatter for consistency.

### Quick Start
To get started, run:
```bash
npm install
npm run docs:dev
```

### Media (hero video)
- POC: place a single hero video at `docs/media/hero.mp4` (H.264 MP4 recommended).
- Optional: per-work videos can be placed at `docs/installations/{slug}/hero.*` and will be discovered by components.
- Provide a poster image at `docs/media/hero.jpg` for fallback/preview.

Note: I created the `docs/media/` folder and added `docs/media/README.md` with guidance on formats, sizes, and how to add files.


### Troubleshooting
If you encounter issues, check the following:
- Ensure the `base` path in `config.mts` matches your repository name.
- Verify that all components are correctly referenced in your Markdown files.
