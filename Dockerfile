# Multi-stage build: build Vue frontend and TypeScript backend, then ship a single runtime image
FROM node:22-alpine AS builder

ENV NODE_ENV=development
WORKDIR /app

# Native deps for npm install
RUN apk add --no-cache python3 make g++

# Prime dependency cache with workspace manifests + lock file
COPY package.json package-lock.json /app/
COPY backend/package.json /app/backend/package.json
COPY frontend/package.json /app/frontend/package.json

# Install workspace deps from lock file (include-workspace-root covers any future root devDeps).
RUN npm ci --workspaces --include-workspace-root

# Copy full sources and build
COPY . /app

# Receive build tag for version display (e.g. 20250222-abc12345)
ARG TAG=""
ENV APP_VERSION=${TAG}

# Build frontend (Vite) and backend (tsc)
RUN npm run build -w frontend && npm run build -w backend && npm prune --omit=dev --workspaces --include-workspace-root

FROM node:22-alpine AS runner

ARG TAG=""
ENV NODE_ENV=production
ENV APP_VERSION=${TAG}
WORKDIR /app

# Patch OS-level vulnerabilities, install libstdc++ (for better-sqlite3 native addon), and remove npm
RUN apk upgrade --no-cache && apk add --no-cache libstdc++ && \
    rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Create non-root user
RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup

# Copy backend runtime, public assets, and pruned node_modules
COPY --from=builder /app/backend/dist /app/backend/dist
COPY --from=builder /app/backend/package.json /app/backend/package.json
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/frontend/dist /app/backend/public

# Defaults (override via env)
ENV PORT=8080
EXPOSE 8080

USER nodeuser

CMD ["node", "backend/dist/index.js"]
