# MUSICA backend - production container image.
#
# Multi-stage so the runtime image carries no toolchain and no dev dependencies.
# The server listens on $PORT and binds all interfaces, which is what a container
# platform expects.

# ---------- Stage 1: install production dependencies ----------
FROM node:22-slim AS deps
WORKDIR /app

# This repository is an npm WORKSPACES monorepo: the root package.json declares
# "workspaces": ["client", "server"], there is a single package-lock.json at the
# root, and the server's real dependencies (express, mongoose, dotenv, ...) are
# declared in server/package.json - NOT at the root.
#
# Every workspace manifest must therefore be present BEFORE `npm ci` runs. If only
# the root manifests are copied, `npm ci` still exits 0 but installs just the
# root's own dev dependency, and the server then dies at runtime with
# "Cannot find package 'dotenv'".
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

# --workspace server installs the API's dependency tree (hoisted to /app/node_modules
# by npm) without pulling in the React client, which this image does not serve.
RUN npm ci --omit=dev --workspace server

# ---------- Stage 2: runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

# dumb-init gives PID 1 correct signal handling, so the graceful SIGTERM
# shutdown in server/src/index.js actually runs on deploy.
RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init \
 && rm -rf /var/lib/apt/lists/*

# node:alpine already ships an unprivileged "node" user (uid 1000).
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Only the server sources are needed at runtime. The React client is built and
# hosted separately as a static site.
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server

# Uploaded media lives on a mounted volume in production (UPLOADS_DIR). This
# directory is only a placeholder so the process can start when uploads are
# disabled, which is the default for an ephemeral-disk deployment.
RUN mkdir -p /app/server/uploads && chown -R node:node /app/server/uploads

USER node

EXPOSE 10000

# The endpoint returns 200 as soon as Express is listening. It does not assert
# database reachability, so this detects a crashed or wedged process rather than
# a slow Atlas round trip.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||10000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/src/index.js"]