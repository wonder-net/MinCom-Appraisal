# =============================================================================
# symfony-backend/docker/nginx/Dockerfile
#
# The single public-facing web tier: builds the React SPA and serves it
# alongside Symfony's API/EasyAdmin (FastCGI straight to the "php" service,
# no separate reverse-proxy hop). Replaces the old three-container split
# (root nginx + standalone frontend container + this nginx) with one image.
#
# IMPORTANT: build context is the REPO ROOT (not symfony-backend/), since
# this Dockerfile needs to reach ../../frontend from here:
#   docker build -f symfony-backend/docker/nginx/Dockerfile .
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: frontend-build — compile the SPA's static assets (TypeScript + Vite)
# -----------------------------------------------------------------------------
FROM node:20.19.0-alpine3.21 AS frontend-build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --frozen-lockfile

COPY frontend/ .

# Build args for Vite — these values are inlined at build time by Vite.
ARG VITE_SENTRY_DSN=""
ARG VITE_ENVIRONMENT="production"
ARG VITE_APP_VERSION="dev"

RUN VITE_SENTRY_DSN=${VITE_SENTRY_DSN} \
    VITE_ENVIRONMENT=${VITE_ENVIRONMENT} \
    VITE_APP_VERSION=${VITE_APP_VERSION} \
    npm run build

# -----------------------------------------------------------------------------
# Stage 2: base — nginx + built SPA + Symfony's public/ front controller,
# non-root execution (custom appuser, UID 1001)
# -----------------------------------------------------------------------------
FROM nginx:1.27.4-alpine3.21 AS base

RUN rm /etc/nginx/conf.d/default.conf && \
    rm -rf /usr/share/nginx/html/*

# The SPA's compiled assets — served directly by the "location /" and asset
# regex blocks in default.{dev,uat,prod}.conf.
COPY --from=frontend-build /app/dist /usr/share/nginx/html

# Symfony's own public/ dir (just index.php + any asset-mapper output) —
# needed for the fastcgi SCRIPT_FILENAME resolution. In dev this is
# overridden by docker-compose's bind mount of ./symfony-backend/public for
# live-editing; in uat/prod (no source mount) this baked-in copy is what's
# actually served.
COPY symfony-backend/public /app/public

COPY symfony-backend/docker/nginx/snippets/ /etc/nginx/snippets/

# Create non-root user and fix ownership of all paths nginx needs to write
RUN addgroup -g 1001 -S appgroup && \
    adduser  -u 1001 -S appuser -G appgroup && \
    chown -R appuser:appgroup /var/cache/nginx && \
    chown -R appuser:appgroup /var/log/nginx && \
    chown -R appuser:appgroup /usr/share/nginx/html && \
    chown -R appuser:appgroup /app/public && \
    touch /var/run/nginx.pid && \
    chown appuser:appgroup /var/run/nginx.pid && \
    # nginx master reads nginx.conf at startup; since we run the whole
    # process as appuser there is no separate master/worker user switch
    # needed, but nginx validates the directive, so remove it.
    sed -i '/^user /d' /etc/nginx/nginx.conf

EXPOSE 8080 8443

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

USER appuser

CMD ["nginx", "-g", "daemon off;"]

# -----------------------------------------------------------------------------
# Stage 3: dev — relaxed rate limits, no TLS
# -----------------------------------------------------------------------------
FROM base AS dev

USER root
COPY symfony-backend/docker/nginx/default.dev.conf /etc/nginx/conf.d/default.conf
RUN chown appuser:appgroup /etc/nginx/conf.d/default.conf
USER appuser

# -----------------------------------------------------------------------------
# Stage 4: uat — ngrok-fronted, no TLS termination here
# -----------------------------------------------------------------------------
FROM base AS uat

USER root
COPY symfony-backend/docker/nginx/default.uat.conf /etc/nginx/conf.d/default.conf
RUN chown appuser:appgroup /etc/nginx/conf.d/default.conf
USER appuser

# -----------------------------------------------------------------------------
# Stage 5: prod — TLS termination on 8443, HTTP→HTTPS redirect on 8080
# -----------------------------------------------------------------------------
FROM base AS prod

USER root
COPY symfony-backend/docker/nginx/default.prod.conf /etc/nginx/conf.d/default.conf
RUN chown appuser:appgroup /etc/nginx/conf.d/default.conf
USER appuser

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-check-certificate -qO- https://127.0.0.1:8443/healthz || exit 1
