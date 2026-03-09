FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json server.ts storage.ts tools.ts planning-tools.ts planning-store.ts planning-types.ts ./
COPY public ./public
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "server.ts"]
