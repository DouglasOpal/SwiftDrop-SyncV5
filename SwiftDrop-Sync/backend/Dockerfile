# ── Dockerfile ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

# Install deps in a separate layer for better cache reuse
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# Final image
FROM base AS runner
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

# Create logs directory
RUN mkdir -p logs && chown -R node:node logs

# Non-root user for security
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/v1/health || exit 1

CMD ["node", "src/server.js"]
