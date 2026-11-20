# ── Build stage ────────────────────────────────────────
# Same Node line as the API image (Node 20 reached end-of-life in April 2026).
FROM node:24-trixie-slim AS build

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .
# When served behind nginx, API calls go to a relative /api path.
ENV VITE_API_BASE=
RUN npm run build

# ── Serve stage ────────────────────────────────────────
# "stable-alpine" follows nginx's stable branch (1.30 at the time of writing).
# Do NOT pin a minor line such as 1.27-alpine: nginx stops patching each branch
# after about a year, and a pinned tag then silently freezes (1.27-alpine has not
# been rebuilt since April 2025). nginx is the login gate in SSO mode, so it must
# keep receiving fixes. Rebuild regularly with:  docker compose build --pull
FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
