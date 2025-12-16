## Project-Specific Guidance

### Work Parsing
Ensure that all works are properly structured in the `docs/works/` directory.

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

### Troubleshooting
If you encounter issues, check the following:
- Ensure the `base` path in `config.mts` matches your repository name.
- Verify that all components are correctly referenced in your Markdown files.
