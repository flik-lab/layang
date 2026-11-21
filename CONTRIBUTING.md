# Contributing

Thanks for considering a contribution to Layang.

## Development setup

Requirements:

- Node.js 22.12 or newer (CI uses the exact version in `.nvmrc`)
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

Build Windows desktop release artifacts:

```bash
pnpm run desktop:win
```

Build Linux desktop release artifacts on Linux:

```bash
pnpm run desktop:linux
```

Build the standalone CLI archive for the current OS:

```bash
pnpm run cli:dist
```

Run checks before opening a pull request:

```bash
pnpm run typecheck
pnpm lint
pnpm test
pnpm run build
```

## Releases

CI and releases use the exact Node.js version in `.nvmrc` (it is also the runtime bundled into the standalone CLI). Every workflow action is pinned to a commit SHA; Dependabot (`.github/dependabot.yml`) proposes weekly updates for actions and npm packages.

The release workflow (`.github/workflows/release.yaml`) runs the same reusable verification as pull requests (`.github/workflows/verify.yaml`), packages Windows and Linux, and then creates a **draft** GitHub Release. Release notes come from the `## <version>` section of `CHANGELOG.md`; the release fails without it. The draft includes a `SHA256SUMS` file over every asset and GitHub build provenance attestations (`gh attestation verify <file> --repo flik-lab/layang`). A maintainer publishes the draft by hand; only then does auto-update offer it. Manual runs (**Run workflow**) are accepted only from `main`.

Repository admins must configure once:

- **Settings → Environments → `release`**: add required reviewers and limit deployments to the `main` branch and `v*` tags. The publish job waits for this approval before it creates the tag (manual runs) or the draft release.
- Optional Windows code signing: add the secrets `WINDOWS_CERTIFICATE_PFX_BASE64` (the `.pfx` file, base64-encoded) and `WINDOWS_CERTIFICATE_PASSWORD`. Without them, Windows artifacts are built unsigned.
- Branch protection: required status checks are now named `Verify / Quality / ubuntu-latest`, `Verify / Quality / windows-2025`, `Verify / Dependency audit` and `Verify / Real Electron renderer security smoke / Linux`.

## Project conventions

- Use TypeScript for new code.
- Keep browser gRPC-Web code separate from Electron native gRPC code.
- Renderer code must not use direct Node.js APIs.
- Native gRPC features should go through the Electron preload bridge.
- Avoid storing secrets in localStorage unless they are explicitly user-provided and clearly labeled as local-only.
- Keep sample protos small and safe to share.

## Technology stack

- Runtime and package manager: Node.js 22.12 or newer (the exact CI version is in `.nvmrc`) with pnpm 10 or newer.
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
- [ ] `pnpm lint` passes locally.
- [ ] `pnpm test` passes locally.
- [ ] `pnpm run build` passes locally.
- [ ] Docs were updated when behavior changed.
- [ ] No secrets, private endpoints, or customer data were committed.

## Architecture notes

The app has two transport paths:

1. Browser gRPC-Web through APISIX/Envoy.
2. Electron native gRPC through `@grpc/grpc-js` in the main process.

Keep these paths separate so the web app remains safe and deployable without Node.js native access.
