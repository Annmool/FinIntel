FROM node:22-bookworm-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/quant_core

ENV NODE_ENV=production
ENV PORT=5000
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build --chown=node:node /app/index.js ./index.js
COPY --from=build --chown=node:node /app/quant_service.js ./quant_service.js
COPY --from=build --chown=node:node /app/models ./models
COPY --from=build --chown=node:node /app/middleware ./middleware
COPY --from=build --chown=node:node /app/services ./services
COPY --from=build --chown=node:node /app/quant_core ./quant_core

USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:5000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "index.js"]
