# Layang GitHub Pages

This folder is the public landing-site source for Layang.

## Pages

- `index.html` - the product landing page: request file and CLI output, app screenshot, workflow, streaming mock scenario, workspace layout, transport support, CLI in CI, and downloads.

Version numbers and platform claims on the page must match `package.json` and the release workflow; `tests/site-content.test.cjs` checks this.

## Assets

- `assets/styles.css` - the page styles (light and dark from the same tokens).
- `assets/layang-logo.png` - logo and favicon.
- `assets/app-unary-light.png`, `assets/app-unary-dark.png` - the app with the sample workspace (Greeter, Orders, Health) at 2x.
- `assets/app-stream-dark.png`, `assets/app-mock-dark.png`, `assets/app-mock-dark-crop.png` - streaming response and mock scenario editor.
- `assets/og-image.png` - 1200x630 social preview.

Screenshots must only show the public sample workspace against `127.0.0.1`/`localhost`. Never commit a screenshot with internal service names, project names or private IP addresses.

## Local checks

The Pages workflow builds a synthetic API reference into `reference/` before uploading this directory. For a local reference preview, follow the [workspace publishing guide](../docs/WORKSPACE_DOCUMENTATION.md).

## Publish

The repository workflow at `.github/workflows/pages.yaml` publishes this folder and the generated example reference to GitHub Pages.

## Custom domain

- `CNAME` is configured for `layang.mff.web.id`.
- `index.html`, `robots.txt`, and `sitemap.xml` use the same canonical production URL for search indexing.
