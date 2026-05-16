# Stage 0: Build the TM Hub Companion userscript so hub.tri.ovh/companion.user.js
# resolves. The build script writes to extension/dist/ and (when frontend/public
# exists) also publishes a copy into public/. We stage frontend/public/ in the
# workspace so the publish side-effect lands somewhere we can COPY from.
FROM node:20-alpine AS extension
WORKDIR /workspace
COPY extension/ ./extension/
COPY frontend/public/ ./frontend/public/
WORKDIR /workspace/extension
RUN npm ci
RUN npm run build

# Stage 1: Build frontend (with companion userscript copied into public/)
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
COPY --from=extension /workspace/frontend/public/companion.user.js ./public/companion.user.js
# Sprint 2 of the perf plan: ship the sourcemap publicly so Chrome DevTools
# can resolve identifier-minified stack traces back to TypeScript. Companion
# is already open-source on Greasy Fork so this discloses nothing new — see
# extension/docs/rum-privacy-review.md and Plans/chc-zadba-bardoz-snazzy-wave.md.
COPY --from=extension /workspace/frontend/public/companion.user.js.map ./public/companion.user.js.map
RUN npm run build

# Stage 2: Backend + nginx reverse proxy
FROM python:3.12-slim
WORKDIR /app

# Install nginx + brotli CLI + nginx brotli modules (libnginx-mod-http-brotli-*)
# nginx-full ensures the libnginx-mod-* modules match. brotli CLI is used at
# build time to pre-compress static assets (.br alongside .gz).
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx-full \
        libnginx-mod-http-brotli-filter \
        libnginx-mod-http-brotli-static \
        brotli && \
    rm -rf /var/lib/apt/lists/* && \
    rm -f /etc/nginx/sites-enabled/default

COPY pyproject.toml .
RUN pip install --no-cache-dir . && pip install --no-cache-dir --pre "apscheduler>=4.0.0a5" && pip install --no-cache-dir "redis>=5.0.0" "gunicorn>=23.0.0"
COPY api/ api/
COPY --from=frontend /frontend/out/ static/
RUN find static -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.svg' -o -name '*.xml' -o -name '*.txt' -o -name '*.map' \) -exec gzip -9 -k {} \; -exec brotli -q 11 -k {} \;
COPY nginx.conf /etc/nginx/nginx.conf
RUN mkdir -p data

# Start script: nginx + gunicorn (multi-worker)
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 8000
CMD ["./start.sh"]
