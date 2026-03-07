FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json server.ts ./
COPY public ./public
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "server.ts"]
