# Aurora backend image.
#
# IMPORTANT: build context must be the REPO ROOT, not backend/, e.g.:
#   docker build -f backend/Dockerfile -t aurora-backend .
#
# Why: backend/src/snapshot.ts imports `../../src/data/spots.json`, a file
# that lives OUTSIDE backend/ (it's the frontend's spot list, shared with the
# app). tsc compiles that relative import as-is (JSON import assertions are
# not path-rewritten), so the compiled backend/dist/snapshot.js still expects
# `../../src/data/spots.json` relative to itself. Since dist/ sits at the same
# depth under backend/ as src/ did (backend/dist/snapshot.js vs.
# backend/src/snapshot.ts), that resolves to <repo-root>/src/data/spots.json
# both at build time (tsc) and at runtime (node) -- see backend/tsconfig.json
# `include` and backend/dist/snapshot.js after `npm run build` if you want to
# verify this yourself. Concretely, both stages below need:
#   /app/backend/...           (this package)
#   /app/src/data/spots.json   (the one frontend file the backend imports)
# with /app/backend and /app/src siblings, exactly like the repo root.

# ---- Stage 1: deps (full deps, needed to run tsc in the build stage) ----
FROM node:22-alpine AS deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# ---- Stage 2: build (compile TypeScript -> dist/) ----
FROM node:22-alpine AS build
WORKDIR /app/backend
COPY --from=deps /app/backend/node_modules ./node_modules
COPY backend/package.json backend/package-lock.json backend/tsconfig.json ./
COPY backend/src ./src
COPY src/data/spots.json /app/src/data/spots.json
RUN npm run build

# ---- Stage 3: runtime (production deps only + compiled output + the spots data it imports) ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/backend

# Non-root user to run the app as.
RUN addgroup -S aurora && adduser -S aurora -G aurora

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/src/data/spots.json /app/src/data/spots.json
# Seed backend/data/ with the git-tracked snapshot mirror (backend/data/latest-snapshot.json)
# so a freshly-built image behaves like a fresh git checkout: /v1/tonight can
# serve stale-but-real data immediately, before the first live refresh
# completes (see backend/README.md "Restart survival"). A VOLUME is declared
# below for this directory -- when that volume is first created, Docker
# copies this seeded content into it, and all later writes (new refreshes,
# and eventually usage-stats persistence) land on the volume, not the image.
COPY backend/data ./data

RUN chown -R aurora:aurora /app/backend /app/src
USER aurora

EXPOSE 8080

# Persist the snapshot mirror (and any future usage-stats storage) across
# container recreation/redeploys.
VOLUME ["/app/backend/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
