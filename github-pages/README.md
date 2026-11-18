# Layang GitHub Pages

This folder is the public landing-site source for Layang.

## Pages

- `index.html` - product landing page for Layang 1.1.6, including REST, WebSocket, gRPC, gRPC-Web, local mocks, gateway access, certificate settings, documentation, workspace files, CLI, and download sections.

## Assets

- `assets/layang-logo.png`
- `assets/layang-app-screenshot.png`
- `assets/layang-app-ws.png`
- `assets/layang-mock-stream.png`
- `assets/layang-app-documentation.png`
- `assets/styles.css`

## Local checks

The Pages workflow builds a synthetic API reference into `reference/` before uploading this directory. For a local reference preview, follow the [workspace publishing guide](../docs/WORKSPACE_DOCUMENTATION.md).

## Publish

The repository workflow at `.github/workflows/pages.yaml` publishes this folder and the generated example reference to GitHub Pages.

## Custom domain

- `CNAME` is configured for `layang.mff.web.id`.
- `index.html`, `robots.txt`, and `sitemap.xml` use the same canonical production URL for search indexing.
