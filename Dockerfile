# syntax=docker/dockerfile:1

# ── build: compile the SPA + bundle the tiny server ────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server

# ── runtime: just Node + the built assets (no node_modules) ────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
# PORT is intentionally not baked in, so config.yml's `port:` can take effect;
# override at runtime with `-e PORT=...`.
ENV NODE_ENV=production \
    DATA_DIR=/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server/server.mjs ./server.mjs

# Mount a directory with your config.yml + dbt artifacts here to see your own
# project; with nothing mounted, the server falls back to the synthetic demo.
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://localhost:${PORT:-8080}/healthz" || exit 1

CMD ["node", "server.mjs"]
