# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Backend + nginx reverse proxy
FROM python:3.12-slim
WORKDIR /app

# Install nginx
RUN apt-get update && apt-get install -y --no-install-recommends nginx && \
    rm -rf /var/lib/apt/lists/* && \
    rm -f /etc/nginx/sites-enabled/default

COPY pyproject.toml .
RUN pip install --no-cache-dir . && pip install --no-cache-dir --pre "apscheduler>=4.0.0a5" && pip install --no-cache-dir "redis>=5.0.0" "gunicorn>=23.0.0"
COPY api/ api/
COPY --from=frontend /frontend/out/ static/
RUN find static -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.svg' -o -name '*.xml' -o -name '*.txt' \) -exec gzip -9 -k {} \;
COPY nginx.conf /etc/nginx/nginx.conf
RUN mkdir -p data

# Start script: nginx + gunicorn (multi-worker)
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 8000
CMD ["./start.sh"]
