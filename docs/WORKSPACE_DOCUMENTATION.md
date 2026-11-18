# Publish a Layang workspace

Keep the workspace README short. Link to the generated workspace index and name the collections users can run. Keep the Layang-managed workspace layout for source files and use the readable publication paths for navigation.

```text
workspace/
  README.md
  layang.yml
  collections/                 Saved requests and examples
  protos/                      Revision snapshots and original .proto import paths
  mocks/grpc/scenarios/        One canonical YAML file per scenario
  docs/
    published/
      index.md
      tactical-navigation/     Collection documentation
      grpc/
        index.md
        tactical-navigation/
          index.md             RPCs, message types, and featured scenarios
          watch-tracks/scenarios/
            index.md           Scenario catalog
            page-2.md
      rest/
        openapi.yaml
    site/                      Static site for GitHub Pages
    wiki-export/               Markdown bundle for wiki imports
```

Published paths use lowercase names with hyphens. Duplicate sibling names get a numbered suffix such as `tactical-navigation-2`. Rebuild when migrating old generated paths so Layang can update internal links. Keep source file names and directories managed by Layang when editing requests, proto revisions, or scenarios.

## Build and check

```bash
layang docs:build ./workspace
layang docs:build ./workspace --check
```

Open `docs/published/index.md` locally or deploy the contents of `docs/site/` to GitHub Pages. Layang ignores the generated Markdown, HTML, wiki bundle, and build manifest in Git by default. Build them in CI from tracked workspace sources. The published Markdown links to original source files using relative paths. To enable those source links on the static site, pass the same repository file base URL on build and check.

```bash
layang docs:build ./workspace --source-base-url https://github.com/example/tacnav/blob/main
layang docs:build ./workspace --source-base-url https://github.com/example/tacnav/blob/main --check
```

Use a URL that points to the workspace root in the repository. If the workspace is in a subdirectory, include that subdirectory in the base URL.

## Protocol references

The gRPC reference uses the default proto revision for each library and documents request and response message types, streaming direction, and the declaring proto file. Saved request pages describe their pinned revisions. Service pages feature up to three enabled scenarios per RPC, preferring different delivery modes. Catalog pages list 100 scenarios at a time and contain names, delivery modes, response counts, and links. The scenario payload stays in its canonical YAML file.

The REST export uses OpenAPI 3.1.0. It describes paths, HTTP methods, operation IDs, parameters, JSON body schemas, and statuses and JSON response shapes available from saved responses or configured mocks. Inferred schemas describe the available evidence. Review them before publishing them as a service contract.

WebSocket documentation describes the connection and message examples in the operation pages.

## Try the example

Generate the synthetic Tactical Navigation workspace from a checkout, then build and validate the outputs.

```bash
node tests/fixtures/docs-publication-workspace.cjs ./tacnav-example
node bin/layang.cjs docs:build ./tacnav-example
node bin/layang.cjs docs:build ./tacnav-example --check
pnpm --package=@redocly/cli@1.34.6 dlx redocly lint --extends spec ./tacnav-example/docs/published/rest/openapi.yaml
```

Open `tacnav-example` in Layang and choose **Mocking → WatchTracks** to try the incoming, manual, and periodic scenarios. The repository Pages workflow publishes this synthetic example under `reference/`.

To try the REST example, start the mock and send a request to the documented route.

```bash
node bin/layang.cjs mock:start ./tacnav-example --protocol rest --daemon
curl -i -X POST http://127.0.0.1:18081/tracks/alpha -H 'Content-Type: application/json' -d '{"name":"Alpha","history":[1,2]}'
node bin/layang.cjs mock:stop ./tacnav-example
```
