# =============================================================================
# symfony-backend/docker/php/Dockerfile
# Multi-stage build: base -> dev | prod
# Mirrors ../../backend/Dockerfile's structure for the Django rewrite.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: base — OS packages + PHP extensions common to dev and prod
# -----------------------------------------------------------------------------
FROM php:8.3-fpm-alpine AS base

LABEL maintainer="MINCOM DevOps <devops@mincom.example>"
LABEL org.opencontainers.image.title="mincom-symfony-backend"

RUN apk add --no-cache \
        icu-dev \
        libzip-dev \
        libsodium-dev \
        libpng-dev \
        libjpeg-turbo-dev \
        freetype-dev \
        oniguruma-dev \
        mariadb-client \
        curl \
        git \
        unzip \
        $PHPIZE_DEPS \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
        pdo_mysql \
        intl \
        zip \
        opcache \
        sodium \
        bcmath \
        gd \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del $PHPIZE_DEPS

# php-fpm-healthcheck: what docker-compose.yml's healthcheck actually calls —
# not installed by any base image, so without this the healthcheck previously
# silently no-op'd via its own `|| true` fallback.
RUN curl -o /usr/local/bin/php-fpm-healthcheck \
        https://raw.githubusercontent.com/renatomefi/php-fpm-healthcheck/v0.5.1/php-fpm-healthcheck \
    && chmod +x /usr/local/bin/php-fpm-healthcheck

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

RUN addgroup -g 1001 appuser && adduser -D -u 1001 -G appuser appuser

WORKDIR /app

COPY composer.json composer.lock symfony.lock ./

# -----------------------------------------------------------------------------
# Stage 2: dev — full dependencies (including dev), source mounted over this
# by docker-compose.yml for hot-reload; image stays runnable standalone.
# -----------------------------------------------------------------------------
FROM base AS dev

ENV APP_ENV=dev

RUN composer install --no-interaction --no-scripts --prefer-dist

COPY --chown=appuser:appuser . /app

RUN php bin/console cache:clear --env=dev --no-warmup \
    && php bin/console cache:warmup --env=dev \
    && php bin/console assets:install public --env=dev

# cache:warmup above runs as root (USER appuser hasn't been set yet), so
# everything it creates under var/ — including subdirectories the rate
# limiter, Doctrine result cache, etc. create lazily at runtime — is
# root-owned. Without this, php-fpm (running as appuser at runtime) can't
# write new cache-pool subdirectories and every write fails silently
# (a WARNING-level log, not a crash), which for the rate limiter's
# filesystem-backed storage means throttling never persists a counter and
# fails open — found by actually hammering the login endpoint past its
# limit in the prod stack and seeing zero 429s, not by reasoning about it.
RUN chown -R appuser:appuser /app/var

RUN chmod +x /app/entrypoint.sh

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
    CMD php-fpm-healthcheck || exit 1

USER appuser

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["php-fpm"]

# -----------------------------------------------------------------------------
# Stage 3: prod — no dev dependencies, optimized autoloader, minimal surface
# -----------------------------------------------------------------------------
FROM base AS prod

ENV APP_ENV=prod

RUN composer install --no-interaction --no-scripts --no-dev --prefer-dist --optimize-autoloader

COPY --chown=appuser:appuser . /app

# Warms the DI container / annotations / routes caches at build time so the
# first real request doesn't pay that cost. Safe without a live database:
# compiling the container never opens a Doctrine connection, it only wires
# service definitions.
RUN php bin/console cache:warmup --env=prod --no-debug \
    && php bin/console assets:install public --env=prod --no-debug

# See the matching comment in the dev stage above: cache:warmup runs as
# root here too, leaving var/ root-owned while php-fpm runs as appuser at
# runtime — without this, every runtime cache write (rate limiter storage
# included) fails silently and the rate limiter fails open.
RUN chown -R appuser:appuser /app/var

RUN chmod +x /app/entrypoint.sh

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
    CMD php-fpm-healthcheck || exit 1

USER appuser

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["php-fpm"]
