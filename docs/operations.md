# Independent tool servers

The four apps share a source repository and release version, but each has its own image,
Deployment, Service, TLS certificate, and origin. Changing `apps/<tool>/` builds only that
tool. Changes to shared code, the Node server, build scripts, dependencies, or the Dockerfile
build all four. Release Please metadata alone skips application checks and image builds.

| Tool          | Origin                                | Delivery target      | Image                                                     |
| ------------- | ------------------------------------- | -------------------- | --------------------------------------------------------- |
| Transcode     | `https://tools-transcode.dsub.io`     | `tool-transcode`     | `registry.dsub.io/echovisionlab/geul-tools-transcode`     |
| YouTube Audio | `https://tools-youtube-audio.dsub.io` | `tool-youtube-audio` | `registry.dsub.io/echovisionlab/geul-tools-youtube-audio` |
| HWP           | `https://tools-hwp.dsub.io`           | `tool-hwp`           | `registry.dsub.io/echovisionlab/geul-tools-hwp`           |
| PortAdj       | `https://tools-portadj.dsub.io`       | `tool-portadj`       | `registry.dsub.io/echovisionlab/geul-tools-portadj`       |

## Build and release

Use Node `24.21.0` and pnpm `12.9.1`. Install with `pnpm install --frozen-lockfile`.
Build a tool with `pnpm build -- <tool>`, or build its container with
`docker build --build-arg TOOL=<tool> -t geul-tools-<tool>:local .`.
The container carries only the selected app's generated static assets and server files.
YouTube Audio additionally copies its server package and dependency closure from the
frozen root installation without resolving dependencies again. Other tools carry no
production npm dependencies. Browser WASM and worker assets remain in the selected app's `dist` directory.

A normal main push only runs Release Please. Production publishing runs exclusively when
Release Please creates a release, checks out its tag, and verifies the tag SHA against
Release Please's output. Each affected image receives `vMAJOR.MINOR.PATCH` and
`sha-<release-commit>` tags and OCI source/revision/version labels. Publishing verifies
both tags resolve to the emitted digest, then checks the immutable image's health and
parent framing policy. PR checks never publish images.

The first release builds all four images. Later releases compare source paths with the
previous release tag. An unchanged tool intentionally has no tag for a later repository
version: its existing digest remains deployed. Shared dependency or server changes build
all images. Independent tool version numbers can be introduced if operational evidence
requires them; the initial release uses one version to keep the shared contract explicit.

Required GitHub Actions secrets: `HARBOR_REGISTRY_USERNAME`, `HARBOR_REGISTRY_PASSWORD`.
The Harbor `echovisionlab` project remains public for anonymous runtime pulls.
No secret is required by the three static tools. YouTube Audio validates the existing
`__Host-dsub-session` cookie through
`OATHKEEPER_URL=http://dsub-identity-oathkeeper-prod:4455` on every API request.
Its frontend calls the canonical `https://www.dsub.io/api/tools/youtube-audio` API with
credentials; the WWW Ingress routes that prefix directly to the YouTube mini server.
`TOOL_ORIGIN=https://tools-youtube-audio.dsub.io` and
`PUBLIC_API_ORIGIN=https://www.dsub.io` define its exact browser CORS boundary.

## GitOps activation

The deployment repository registers all four targets with `activation: review`.
After image publishing, run its **Image delivery** workflow on main with the registered
`tool-<tool>` target and the release tag or verified digest. The resulting delivery PR
must retain OCI source and SHA proof. Review and merge it to activate that tool through
Flux. No mutable image tags belong in production manifests.

Initial bootstrap placeholders in `tool-runtime.yaml` and the application-runtime image
transformers must be replaced by verified first-release digests before the deployment
changes are merged. A syntactically valid placeholder is not a runnable image.

Use the existing `geul-application-images` ServiceAccount, which carries no private pull
credentials and mounts no API token. Containers run as UID 1000 with a read-only root
filesystem, `/tmp` volume, resource limits, and startup/readiness/liveness health checks.
Each workload has one desired replica. Rolling updates allow a replacement to become
ready before terminating the old process; YouTube's in-memory source handles belong to
its originating process and should be resolved again after that process exits.

`EMBED_PARENT_ORIGINS=https://www.dsub.io` allows only the canonical DSUB parent to frame
the app. These one-level subdomains are independently secured by HAProxy and cert-manager.
ExternalDNS here watches `DNSEndpoint` CRDs, not Ingress annotations, so the deployment
DNS endpoint inventory and controller allowlist include each tool host as a DNS-only
CNAME to `www.dsub.io`, whose existing A record carries the public origin address.

Ingress is limited to HAProxy on TCP 8080. All tool pods can resolve cluster DNS; only
YouTube Audio can initiate public HTTPS connections. Any internal authentication endpoint
is allowed only to Oathkeeper pods on TCP 4455, with the matching Oathkeeper ingress rule.

## Verification and measurements

Verify the release image digest, Flux Ready/Healthy status, Deployment availability,
actual pod `imageID`, `/healthz`, canonical-parent framing, and the app's browser workflow.
A successful local build does not establish production delivery or browser functionality.

No performance improvement is claimed by packaging alone. Record before/after measurements
under the same runtime and workload conditions before claiming reduced build time,
redeploy time, download size, or memory use. Release build and live rollout measurements
are pending the first publication and production activation; do not substitute estimated
numbers for those observations.

Measured native container context/builds, the completed Web source-removal comparison,
and root-run selected mini app builds are recorded with their cache conditions in
[performance.md](performance.md). The Web build showed no overall speedup; logical
`.next` output decreased by about 13.4 MB. Production AMD64 image proof and live
redeploy measurements remain pending.
