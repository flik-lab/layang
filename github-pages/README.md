# Layang GitHub Pages

This folder is the only public documentation and landing-site source for Layang.

## Pages

- `index.html` - product landing page with the main app screenshot, mocking and streaming screenshot, documentation screenshot, workspace explanation, CLI block, and CTA.

## Assets

- `assets/layang-logo.png`
- `assets/layang-app-screenshot.png`
- `assets/layang-mock-stream.png`
- `assets/layang-app-documentation.png`
- `assets/styles.css`

## Local checks

```bash
pnpm run docs:build
pnpm run docs:dev
```

## Publish

The repository workflow at `.github/workflows/pages.yml` publishes this folder directly to GitHub Pages. You can also copy the folder contents into a `gh-pages` branch manually.
