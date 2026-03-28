# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Backend + serve frontend
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir . && pip install --no-cache-dir --pre "apscheduler>=4.0.0a5"
COPY api/ api/
COPY --from=frontend /frontend/out/ static/
RUN mkdir -p data
EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
