# Contributing

Thanks for considering a contribution to Layang.

## Development setup

Requirements:

- Node.js 20 or newer
- pnpm 10 or newer

Install dependencies:

```bash
pnpm install
```

Run the web app:

```bash
pnpm run dev
```

Run the Electron desktop app:

```bash
pnpm run desktop
```

Build the production app:

```bash
pnpm run build
```

Create the default Windows Squirrel installer:

```bash
pnpm run desktop:win:setup
```

Create the optional Windows MSI installer:

```bash
pnpm run desktop:win:setup:msi
```

Install WiX Toolset v3 first on Windows if you need MSI builds:

```powershell
choco install wixtoolset --version=3.14.0
```

Create Linux packages:

```bash
pnpm run desktop:deb
pnpm run desktop:rpm
```

Run checks before opening a pull request:

```bash
pnpm run typecheck
pnpm run lint
pnpm run format
pnpm run build
```

## Project conventions

- Use TypeScript for new code.
- Keep browser gRPC-Web code separate from Electron native gRPC code.
- Renderer code must not use direct Node.js APIs.
- Native gRPC features should go through the Electron preload bridge.
- Avoid storing secrets in localStorage unless they are explicitly user-provided and clearly labeled as local-only.
- Keep sample protos small and safe to share.

## Technology stack

- Runtime and package manager: Node.js 20 or newer with pnpm 10 or newer.
- App framework: TypeScript, React 19, Next.js 16, and Tailwind CSS.
- Desktop shell: Electron 42 with preload bridges for native-only features.
- API transports: browser gRPC-Web, Electron native gRPC through `@grpc/grpc-js`, protobuf loading through `@grpc/proto-loader` and `protobufjs`, plus WebSocket workflows.
- Tooling: Biome for linting/formatting, Node.js test runner for unit tests, and GitHub Pages static assets for the public website.

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
- [ ] `pnpm run typecheck` passes locally.
- [ ] `pnpm run lint` passes locally.
- [ ] `pnpm run format` passes locally.
- [ ] `pnpm run build` passes locally.
- [ ] Docs were updated when behavior changed.
- [ ] No secrets, private endpoints, or customer data were committed.

## Architecture notes

The app has two transport paths:

1. Browser gRPC-Web through APISIX/Envoy.
2. Electron native gRPC through `@grpc/grpc-js` in the main process.

Keep these paths separate so the web app remains safe and deployable without Node.js native access.
