# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32
FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tooling ./tooling
RUN pnpm fetch
RUN pnpm install --frozen-lockfile --offline

FROM dependencies AS builder
ARG TOOL
COPY . .
RUN pnpm build -- ${TOOL} \
    && mkdir -p /runtime-app \
    && cp -a apps/${TOOL}/dist /runtime-app/dist \
    && if [ -d apps/${TOOL}/server ]; then cp -a apps/${TOOL}/server /runtime-app/server; fi

FROM dependencies AS runtime-dependencies
ARG TOOL
# Copy the selected server dependency closure from the frozen install, without re-resolution.
RUN node --input-type=module <<'NODE'
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
const output = '/runtime/node_modules';
mkdirSync(output, { recursive: true });
const copied = new Set();
function copyPackage(name, from = '/app') {
  if (copied.has(name)) return;
  let directory = from;
  while (!existsSync(join(directory, 'node_modules', name, 'package.json'))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Installed runtime package not found: ${name}`);
    directory = parent;
  }
  const source = realpathSync(join(directory, 'node_modules', name));
  const destination = join(output, name);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, dereference: true });
  copied.add(name);
  const pkg = JSON.parse(readFileSync(join(source, 'package.json')));
  for (const dependency of Object.keys(pkg.dependencies ?? {})) copyPackage(dependency, source);
}
if (process.env.TOOL === 'youtube-audio') copyPackage('@echovisionlab/youtube-audio');
console.log(`Runtime packages: ${[...copied].join(', ') || 'none'}`);
NODE

FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runner
ARG TOOL
ENV NODE_ENV=production PORT=8080 TOOL_ID=${TOOL}
WORKDIR /app
COPY --from=runtime-dependencies --chown=node:node /runtime/node_modules ./node_modules
COPY --from=builder --chown=node:node /runtime-app ./apps/${TOOL}
COPY --from=builder --chown=node:node /app/scripts/tools.mjs ./scripts/tools.mjs
COPY --from=builder --chown=node:node /app/server ./server
USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
