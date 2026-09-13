# regex

A lightweight, fully client-side regular expression tester. Write a pattern, paste test
text, inspect matches, capture groups and replacement output — nothing ever leaves your
browser.

Part of a family of small self-hosted tools (Portal, Paste, QR, Blueprint) sharing a
clean, dark-first, minimal interface.

## Features

- Live match highlighting with match count and per-match details
- Numbered and named capture groups, visually distinct from match values
- Flags: `g` (global), `i` (ignore case), `m` (multiline), `s` (dotAll), `u` (unicode)
- Live replacement preview with native `$1`, `$<name>`, `$&`, `$$` semantics
- Clear validation errors for invalid expressions
- "Explain pattern" mode: a deterministic, local breakdown of literals, classes,
  quantifiers, anchors, groups, alternation and lookarounds — no AI, no external
  services; unsupported or ambiguous constructs are flagged honestly
- One-click copy for the pattern, matched values and the replacement result
- Shareable state via the URL fragment (no server storage); warns when a link grows
  very large
- Evaluation runs in a Web Worker with a timeout safeguard, so pathological patterns
  (catastrophic backtracking) abort with a clear message instead of freezing the UI

## Privacy

No accounts, no database, no analytics, no telemetry, no persistent storage. The regex
engine runs locally in a Web Worker; the only network request your browser makes is for
the app's own static assets. State can be shared purely through the URL fragment.

## Local development

Requires Node 22+.

```sh
npm install
npm run dev        # start dev server
npm test           # run unit tests (vitest)
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run build      # production build into dist/
```

## Docker

Build and run locally (development/testing):

```sh
docker compose up --build
# then open http://localhost:8080
```

Or without Compose:

```sh
docker build -t regex-utility:local .
docker run --rm -p 8080:8080 regex-utility:local
```

The image serves the static build with an unprivileged nginx, listens on port `8080`,
and includes a built-in healthcheck.

## Published image

CI publishes images to GitHub Container Registry as `ghcr.io/brocahontaz/regex`
(derived from the repository owner/name). For a production deployment, pull the
published image instead of building from source:

```sh
docker run --rm -p 8080:8080 ghcr.io/brocahontaz/regex:latest
```

Available tags:

- `latest` — most recent build of the default branch (`main`)
- `sha-<commit>` — immutable build for a specific commit
- `X.Y.Z` — build for a matching `vX.Y.Z` Git tag/release

Behind a reverse proxy, forward traffic to port `8080` of the container. The app is
static and path-agnostic; no domain or environment configuration is required.

## CI/CD

A single GitHub Actions workflow (`.github/workflows/ci.yml`) handles both:

1. **CI** — on every push and pull request: install, lint, format check, typecheck,
   tests, and a production build.
2. **Publish** — after CI passes, only on pushes to `main` or `v*` tags (never from
   pull requests or other branches): builds the Docker image from the repository
   Dockerfile and pushes it to GHCR using the workflow's built-in `GITHUB_TOKEN`
   (`packages: write` permission), with tags `latest` (default branch), `X.Y.Z`
   (version tags) and `sha-<commit>` (every publish). Docker layer caching via the
   GitHub Actions cache keeps rebuilds fast.

## License

MIT — see [LICENSE](LICENSE).
