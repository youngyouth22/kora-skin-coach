# Production image for the Mastra coach server (Railway, Fly.io, Render, Cloud Run, ...)
FROM node:22-slim AS build
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and configurations
COPY tsconfig.json ./
COPY src ./src

# Build Mastra bundle (.mastra/output)
ENV MASTRA_TELEMETRY_DISABLED=1
RUN npm run build

# Production runtime stage
FROM node:22-slim

# Prepare directory and ensure node user has write permissions
RUN mkdir -p /app && chown -R node:node /app
WORKDIR /app

ENV NODE_ENV=production \
    MASTRA_TELEMETRY_DISABLED=1 \
    PORT=4111

# Copy compiled standalone bundle from build stage with node user ownership
COPY --from=build --chown=node:node /app/.mastra/output ./

# Ensure /app and its contents are owned by node user
RUN chown -R node:node /app

# Run as non-root user for container security
USER node

EXPOSE 4111

# Built-in lightweight health check using Node 22 native fetch
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 4111) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the Mastra server
CMD ["node", "index.mjs"]

