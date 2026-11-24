FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY client ./client
COPY vite.config.js ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY scripts ./scripts
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /data
ENV DATABASE_PATH=/data/mailer.db
EXPOSE 8080
CMD ["node", "server/index.js"]
