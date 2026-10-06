# Measured container preparation

These are local packaging measurements taken on macOS arm64 with native Docker
`linux/arm64`, Node `24.21.0-alpine`, and pnpm `12.9.1`. The base image was pinned to
`sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`.
Builds used `/usr/bin/time -p docker build --progress=plain --build-arg TOOL=<tool>`.

## Build context

Using the same checkout and physical files, the sum of eligible regular file bytes
under the original and amended `.dockerignore` rules changed as follows:

| Ignore rules                                                        | Files |                Bytes |
| ------------------------------------------------------------------- | ----: | -------------------: |
| Before excluding task artifacts                                     | 5,002 |          241,217,609 |
| After excluding `.artifacts`, app artifact directories, and `.work` |   199 |           44,311,039 |
| Reduction                                                           | 4,803 | 196,906,570 (81.63%) |

The extracted task-only Node runtime accounted for 196,902,292 of the excluded bytes.
HWP preparation sources and generated browser runtime assets remained available to
builds. These counts measure filesystem content selected by the ignore rules; they
are separate from BuildKit's incremental transport. For example, the successful local
Transcode build transferred 31.51 kB of app context because prior context content was
already cached. They do not measure network download savings for deployed users.

## Observed builds

| Tool          | Elapsed time | Docker image size, uncompressed | Cache conditions                                                                          |
| ------------- | -----------: | ------------------------------: | ----------------------------------------------------------------------------------------- |
| Transcode     |       8.54 s |               240,532,330 bytes | Base/toolchain cached; fetched 233 dependency packages                                    |
| HWP           |       5.09 s |               312,473,000 bytes | Shared dependency layers cached; selected app rebuilt                                     |
| PortaDJ       |       4.10 s |               239,282,971 bytes | Shared dependency layers cached; selected app rebuilt                                     |
| YouTube Audio |       9.49 s |               272,334,386 bytes | Shared dependencies cached; frozen server dependency closure copied; selected app rebuilt |

These are individual observations under different cache conditions, not a comparative
benchmark across tools. HWP and PortaDJ builds overlapped, so elapsed times also include
shared host contention. Image sizes include the Node base and are Docker's uncompressed
`Size` values, not registry transfer sizes or browser bundle sizes.

The initial Docker build exposed pnpm 12 rejecting `fetch --frozen-lockfile` (5.20 s
failed attempt). Fetch now precedes `install --frozen-lockfile --offline`. The initial
YouTube runtime reduction attempted offline dependency resolution and failed because
fetch does not cache registry metadata (6.79 s failed attempt). The final Dockerfile
copies the exact installed dependency closure, avoiding a second resolution.

The three static app images above were retained for browser validation. A separate
Transcode image rebuilt the final dependency-copy Dockerfile in 3.12 s with shared
layers cached, confirmed an empty runtime dependency set, and passed the same container
checks. These observations do not establish a before/after application build improvement.

## Container checks

All four native images passed UID 1000, read-only root filesystem, selected-app-only
packaging, `/healthz`, HTML, runtime configuration, canonical-parent CSP, and HEAD/byte
Range responses for their static JavaScript, CSS, fonts, and WASM assets:

| Tool          | Assets checked | WASM assets |
| ------------- | -------------: | ----------: |
| Transcode     |              4 |           0 |
| HWP           |             44 |           2 |
| PortaDJ       |             25 |           0 |
| YouTube Audio |              4 |           0 |

YouTube additionally passed exact-origin credentialed CORS preflight (204), disallowed
origin rejection (403 without CORS permission), missing-session rejection (401), and
unavailable authentication upstream handling (503 with no-store headers). Container
checks used a deliberately unavailable localhost authentication endpoint for the final
case and did not contact YouTube or publish production images.

Raw logs, smoke code/results, and measurement metadata are retained locally under the
ignored `.artifacts/docker-validation/` directory. Production architecture is
`linux/amd64`; publishing CI must provide that architecture's image/build/runtime proof.
Browser workflows and live Flux/imageID verification are separate checks.

## DSUB Web source-removal comparison

The root ran one successful measurement per source snapshot using Node `24.21.0`,
Next.js `16.3.8`, warm installed dependencies, and cold `.next` output. Both sides used
the same snapshot directory, package manifest and lockfile hashes, strict local-contract
TypeScript checks, and explicit build placeholders without inherited application secrets.
The snapshot's `.next` and TypeScript build-info files were removed before each run;
prepared public runtime assets and installed root/tooling dependencies remained warm.
This compares source and route removal with identical dependencies, rather than measuring
a dependency-installation or Docker-image change.

| Metric                        |      Before |       After |                Observed difference |
| ----------------------------- | ----------: | ----------: | ---------------------------------: |
| Total build wall time         |    91.897 s |    92.133 s |                           +0.236 s |
| Next reported compilation     |      48.0 s |      44.0 s |                             -4.0 s |
| Next reported TypeScript      |      37.7 s |      43.0 s |                             +5.3 s |
| Static + dynamic routes       |         154 |         148 |                                 -6 |
| Logical emitted `.next` bytes | 893,467,339 | 880,080,662 | -13,386,677 (about 13.4 MB; 1.50%) |

There is no measured overall Web build speedup in this single paired observation.
Next's phase durations are reported by its build output; they are not independent,
repeated microbenchmarks. The byte count sums regular emitted `.next` files excluding
Next cache and symlinks, counting duplicate file copies separately. It excludes `public`
assets and is neither complete Docker size nor physical disk allocation.

Initial failed snapshot attempts involving absolute source aliases and tooling dependency
resolution are excluded from the successful before/after comparison. The Web benchmark
logs, snapshot metadata, and result JSON are retained locally under
`geul-web/.artifacts/page-embed-performance/`. The Web repository also records this proof
in `docs/performance/page-embed-tools.md`.

The operational benefit is independent delivery: a tool-specific source update builds
and redeploys its own mini server without changing or rebuilding the Web package.
Shared tool server, UI, or dependency changes can rebuild all four tools. Live redeploy
time, production memory, registry transfer, and browser performance require their own
observations and are not inferred from the numbers above.

## Selected mini app source builds

The root ran all four selected app builds sequentially using exact Node `24.21.0`
and Vite `8.3.3`. Before each command, only that app's generated `dist` was deleted.
Installed dependencies, OS caches, prepared public assets, and the other app outputs
remained warm; no dependency installation ran. All four commands completed successfully
with the same package manifest and lockfile hashes.

The timed command was `node scripts/build.mjs <tool>`, the Node entrypoint behind
`pnpm build -- <tool>`. Wall time includes that entrypoint and preparation work; pnpm
process startup is excluded. Vite's duration is its separately reported bundle phase.

| Tool          | Build wall time | Vite reported time | Logical dist bytes | Files |
| ------------- | --------------: | -----------------: | -----------------: | ----: |
| Transcode     |         0.839 s |            0.651 s |          2,318,830 |     5 |
| YouTube Audio |         0.555 s |            0.417 s |          2,324,765 |     5 |
| HWP           |         0.440 s |            0.309 s |         44,317,815 |    61 |
| PortaDJ       |         0.349 s |            0.215 s |          1,275,746 |    26 |

HWP had 43,256,523 bytes of prepared public runtime assets present before its command.
Its preparation still runs through the build entrypoint, but this measurement uses the
warm prepared runtime rather than an uncached archive extraction. Logical dist bytes
sum all selected app emitted regular files, including assets copied from `public` and
duplicate file copies, excluding symlinks. They are not gzip, registry, or physical disk
allocation sizes.

These are single observations of each selected Vite bundle build. The whole Web build
also performs strict TypeScript checking and Next route generation; the workloads differ,
so the timings do not support a speed ratio between a mini app and Web. The operational
change is that a tool update can build and deploy independently of Web. The Web paired
measurement remains 91.897 to 92.133 seconds, with no overall speedup and about 13.4 MB
less logical `.next` output.

The executed harness, per-tool result JSON/build logs, and combined `root-timings.log`
are retained locally under ignored `.artifacts/page-embed-builds/`. Production
`linux/amd64` image proof and live redeploy measurements remain pending; the successful
source builds and native ARM64 container checks do not establish those boundaries.
