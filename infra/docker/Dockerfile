# ==============================================================================
# MULTI-STAGE PRODUCTION DOCKERFILE FOR AMRUTAM TELEMEDICINE BACKEND
# ==============================================================================

# Stage 1: Build & Dependencies
FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --only=production

COPY . .

# Stage 2: Minimal Production Runtime
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install curl for container health check
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Run as non-privileged user for container security
USER node

COPY --chown=node:node --from=builder /app /app

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/health/live || exit 1

CMD ["node", "src/server.js"]
