# geul-tools

Four independently served DSUB tools: Transcode, YouTube Audio, HWP, and PortaDJ.
Each app has its own static build, Node server process, container image, and production
origin. The repository shares UI foundations and one release version.

| App           | Tool ID         | Production origin                     |
| ------------- | --------------- | ------------------------------------- |
| Transcode     | `transcode`     | `https://tools-transcode.dsub.io`     |
| YouTube Audio | `youtube-audio` | `https://tools-youtube-audio.dsub.io` |
| HWP           | `hwp`           | `https://tools-hwp.dsub.io`           |
| PortaDJ       | `portadj`       | `https://tools-portadj.dsub.io`       |

## Development

Requirements: Node.js `24.21.0` and pnpm `12.9.1`.

```sh
pnpm install --frozen-lockfile
pnpm dev -- transcode
pnpm build -- transcode
pnpm start -- transcode
```

Replace `transcode` with any tool ID. Builds write `apps/<tool>/dist`. HWP builds
prepare the pinned HWP browser runtime automatically, including both WASM assets.
`pnpm dev` serves the frontend through Vite; `pnpm start` serves the built app and its
Node API where applicable. YouTube API requests require its runtime authentication
configuration and an active, onboarded DSUB member.

Run the relevant checks:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:server
```

## Source structure

- `apps/<tool>/`: app entrypoint, tool-specific UI, and selected server handler.
- `packages/audio-client/`: shared Transcode UI and audio worker implementation.
- `shared/`: embed contract, client bootstrap, theme, styles, and locale messages.
- `server/`: static assets, runtime configuration, security headers, byte ranges,
  YouTube authentication/CORS, and shutdown draining.
- `scripts/`: tool selection and build/development entrypoints.
- `tooling/`: the repository's local lint integration.

The parent supplies embed context such as locale and theme through the shared message
contract. Runtime configuration is served from `/runtime-config.js`; `/healthz` supplies
container health checks.

## Production runtime

Build an image with `docker build --build-arg TOOL=<tool> -t geul-tools-<tool>:local .`.
The image runs `node server/index.mjs` as UID 1000 and selects its app through `TOOL_ID`.
It includes only that app's generated build and server files. YouTube additionally
carries its exact server dependency closure from the frozen dependency installation.

| Environment variable   | Production value                            | Applies to    |
| ---------------------- | ------------------------------------------- | ------------- |
| `TOOL_ID`              | Selected tool ID, embedded by Docker        | All tools     |
| `PORT`                 | `8080`                                      | All tools     |
| `EMBED_PARENT_ORIGINS` | `https://www.dsub.io`                       | All tools     |
| `FONT_CDN_ORIGIN`      | `https://cdn.dsub.io` (default)             | All tools     |
| `TOOL_ORIGIN`          | `https://tools-youtube-audio.dsub.io`       | YouTube Audio |
| `PUBLIC_API_ORIGIN`    | `https://www.dsub.io`                       | YouTube Audio |
| `OATHKEEPER_URL`       | `http://dsub-identity-oathkeeper-prod:4455` | YouTube Audio |
| `SESSION_COOKIE_NAME`  | `__Host-dsub-session`                       | YouTube Audio |

YouTube's frontend sends credentialed API requests to
`https://www.dsub.io/api/tools/youtube-audio`. The WWW Ingress sends that prefix directly
to the YouTube mini server. This preserves the existing host-only session cookie: the
cookie belongs to WWW and is validated through Oathkeeper on every request. The mini
origin receives exact-origin credentialed CORS responses. Cookie domains and signing
keys are supplied by the existing identity deployment.

Production GitOps lives in the deployment repository. Each tool has a ClusterIP Service,
one desired Deployment replica, its own HAProxy/TLS origin, and a DNS-only CNAME to
`www.dsub.io`. Containers use a read-only root filesystem and bounded `/tmp` volume.

## Releases

Production images use `registry.dsub.io/echovisionlab/geul-tools-<tool>`. Only a
Release Please-created tag/commit publishes production images, with both
`vMAJOR.MINOR.PATCH` and `sha-<release-commit>` tags. Ordinary main pushes maintain
Release Please; PR checks build and validate the affected tools.

The first release publishes all four images. Later releases publish affected apps;
shared server, dependency, or build changes publish all four. GitOps targets require
review and immutable image digests before activation. See [operations](docs/operations.md)
for release, authentication, and delivery details, and [measurements](docs/performance.md)
for observed container results and their conditions.

Licensed under PolyForm Noncommercial 1.0.0. Copyright 2026 Echo Vision Lab.
Author: state303 <state303@dsub.io>. See [LICENSE](LICENSE).
