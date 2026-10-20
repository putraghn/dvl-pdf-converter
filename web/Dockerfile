# ── Build stage ────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .
# When served behind nginx, API calls go to a relative /api path.
ENV VITE_API_BASE=
RUN npm run build

# ── Serve stage ────────────────────────────────────────
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
