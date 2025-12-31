# syntax=docker/dockerfile:1

# Optimized multi-stage build for minimal image size
# Final image ~300MB instead of ~800MB

# Stage 1: Build the application
FROM node:20-slim AS builder

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Prune dev dependencies after build to reduce size
RUN npm prune --omit=dev

# Stage 2: Production runner (minimal)
FROM node:20-slim AS runner

WORKDIR /app

# Install ONLY runtime libraries (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpixman-1-0 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Create batch jobs directory with proper permissions
RUN mkdir -p /tmp/pdf-to-cbz-jobs && chown nextjs:nodejs /tmp/pdf-to-cbz-jobs

# Copy standalone output (includes server.js and minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static files
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy only the native modules that need platform-specific binaries
# These are rebuilt with Linux binaries from the builder stage
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/canvas ./node_modules/canvas
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
