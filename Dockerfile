FROM node:22-alpine

# --- Build frontend ---
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Setup backend ---
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json server.ts storage.ts tools.ts planning-tools.ts planning-store.ts planning-types.ts ./

# Copy built frontend output
COPY --from=0 /app/frontend/dist ./frontend/dist

# Keep legacy public/ as fallback
COPY public ./public

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "server.ts"]
