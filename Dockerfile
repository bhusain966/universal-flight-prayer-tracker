# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Dependencies
#   Install all dependencies (including devDependencies needed for the build).
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy manifest files only — maximises layer caching
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

RUN pnpm install --frozen-lockfile


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Builder
#   Compile the Vite client bundle and esbuild the Express server.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy installed node_modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy full source
COPY . .

# Build: Vite client → dist/public  |  esbuild server → dist/index.js
RUN pnpm build


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — Production runner
#   Lean image with only the compiled artefacts and production dependencies.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy package manifests so we can install prod-only deps
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/patches ./patches

# Install production dependencies only (no devDeps)
RUN pnpm install --frozen-lockfile --prod

# Copy drizzle migrations (needed at runtime for schema reference)
COPY --from=builder /app/drizzle ./drizzle

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# Health check — hits the tRPC health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/trpc/auth.me || exit 1

CMD ["node", "dist/index.js"]
