FROM node:24-alpine
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --cache=/tmp/npm-cache && rm -rf /tmp/npm-cache
COPY --chown=node:node server.js mydata.js vault.js index.html app.js integration.js services.js taxisnet.js taxisnet-routes.js official-services.js portal-client.js service-routes.js style.css ./
COPY --chown=node:node portal-worker/policy.js ./portal-worker/policy.js
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
