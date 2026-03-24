Hero media folder for my-awsome-portfolio

Purpose
- Place site-level hero media files here for the homepage hero area.

Recommended files
- `hero.mp4` (H.264 MP4) — main looping video used by the homepage `VideoWall` component
- `hero.jpg` or `hero.png` — poster/fallback image shown before the video loads

Guidelines
- Keep loop videos short and optimized (720p or 1080p, ~2–4 Mbps) to reduce bandwidth and improve performance.
- For autoplay compatibility, the initial playback should be muted. Use the UI control to enable audio only on user gesture.
- If you prefer per-work hero videos later, place them in `docs/installations/{slug}/hero.*`.

How to add files
- Copy files into this folder and commit them to the repo. Example:
  ```bash
  mkdir -p docs/media
  cp ~/Downloads/my-hero.mp4 docs/media/hero.mp4
  git add docs/media/hero.mp4
  git commit -m "Add hero video"
  ```

Notes
- If `hero.*` is missing, the site will show a small fallback message on the homepage (no crash).
- Keep an eye on filesize for mobile users and consider adding lower-res variants later.
