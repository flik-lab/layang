# Contributing

Thanks for considering a contribution to Layang.

## Development setup

Requirements:

- Node.js 20 or newer
- npm 10 or newer

Install dependencies:

```bash
npm install
```

Run the web app:

```bash
npm run dev
```

Run the Electron desktop app:

```bash
npm run desktop
```

Run checks before opening a pull request:

```bash
npm run typecheck
npm run build
```

## Project conventions

- Use TypeScript for new code.
- Keep browser gRPC-Web code separate from Electron native gRPC code.
- Renderer code must not use direct Node.js APIs.
- Native gRPC features should go through the Electron preload bridge.
- Avoid storing secrets in localStorage unless they are explicitly user-provided and clearly labeled as local-only.
- Keep sample protos small and safe to share.

## Commit style

Use short, clear commit messages. Recommended prefixes:

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `refactor:` for internal code changes
- `test:` for tests
- `chore:` for maintenance

Examples:

```text
feat: add descriptor set import
fix: decode grpc-web trailers with empty messages
docs: add APISIX CORS setup notes
```

## Pull request checklist

Before opening a PR:

- [ ] The change has a clear description.
- [ ] `npm run typecheck` passes locally.
- [ ] `npm run build` passes locally.
- [ ] Docs were updated when behavior changed.
- [ ] No secrets, private endpoints, or customer data were committed.

## Architecture notes

The app has two transport paths:

1. Browser gRPC-Web through APISIX/Envoy.
2. Electron native gRPC through `@grpc/grpc-js` in the main process.

Keep these paths separate so the web app remains safe and deployable without Node.js native access.
