FROM node:24-bookworm-slim AS build
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN yarn install --immutable && yarn build

FROM node:24-bookworm-slim AS api
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3001 DATABASE_PATH=/app/data/aura.sqlite
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]

FROM nginx:1.28-alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
