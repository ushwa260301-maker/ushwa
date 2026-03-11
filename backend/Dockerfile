FROM node:20-alpine

WORKDIR /app

# Copy root package files for workspaces
COPY package.json package-lock.json* ./
COPY shared ./shared
COPY backend ./backend

# Install all dependencies (workspace-aware)
RUN npm install --workspace=backend --workspace=shared

# Build backend
WORKDIR /app/backend
RUN npm run build

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 5001

ENV NODE_ENV=production
ENV PORT=5001

CMD ["node", "dist/server.js"]
