# Layang GitHub Pages

This folder is the public landing-site source for Layang.

## Pages

- `index.html` - product landing page for Layang 1.0.4, including REST, WebSocket, gRPC, gRPC-Web, local mocks, manual mock file refresh, certificate settings, documentation, workspace files, CLI, and download sections.

## Assets

- `assets/layang-logo.png`
- `assets/layang-app-screenshot.png`
- `assets/layang-app-ws.png`
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

## Custom domain

- `CNAME` is configured for `layang.mff.web.id`.
- `index.html`, `robots.txt`, and `sitemap.xml` use the same canonical production URL for search indexing.
