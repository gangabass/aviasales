FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
ENV VITE_API_BASE_URL=/aviasales-api VITE_BASE_PATH=/aviasales/
RUN npm run build
FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir /data && chown node:node /data
COPY server ./server
COPY migrations ./migrations
COPY --from=frontend /build/dist ./dist
USER node
ENV HOST=0.0.0.0 PORT=3003 DATA_DIR=/data
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3003/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
