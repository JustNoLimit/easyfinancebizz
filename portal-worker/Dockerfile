FROM node:24-bookworm-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends chromium poppler-utils ca-certificates fonts-dejavu-core fonts-liberation && rm -rf /var/lib/apt/lists/*
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends xvfb xauth && rm -rf /var/lib/apt/lists/*
WORKDIR /worker
COPY --chown=node:node package.json package-lock.json ./
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --omit=dev --cache=/tmp/npm-cache && rm -rf /tmp/npm-cache
COPY --chown=node:node worker.js policy.js login.js collect.js identity.js vat-collector.js efka-collector.js keao-collector.js employer-collector.js ./
USER node
ENV NODE_ENV=production PORT=3005 CHROMIUM_PATH=/usr/bin/chromium XDG_CONFIG_HOME=/tmp/portal-config XDG_CACHE_HOME=/tmp/portal-cache
CMD ["xvfb-run","-a","-s","-screen 0 1280x900x24","node","worker.js"]
