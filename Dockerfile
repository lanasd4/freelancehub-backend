# syntax=docker/dockerfile:1

# ---------- Build stage: install everything once, compile, then drop dev packages ----------
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
# the cache mount keeps downloaded packages between builds (and after a network failure)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --fetch-retries=5 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

# ---------- Run stage: only what production needs, no second download ----------
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma
# pruned node_modules: production packages + the generated Prisma client
# (`prisma` itself is a regular dependency, so `migrate deploy` works here)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p uploads && chown -R node:node /app/uploads
USER node
EXPOSE 3100
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
