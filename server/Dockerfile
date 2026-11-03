# Debian 13 (trixie) base, deliberately NOT bookworm: Debian's bookworm
# ghostscript (10.0.0~dfsg-11+deb12u8) is still vulnerable to CVE-2026-101258
# (-dSAFER bypass -> command execution), while trixie ships a fixed build
# (10.05.1~dfsg-1+deb13u3 or newer). Node 20 is also past end-of-life.
# After building, confirm with:  docker compose exec server dpkg -l ghostscript
FROM node:24-trixie-slim

# Ghostscript is required for compress, PDF -> JPG and protect.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ghostscript \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

# Writable location for the activity log (SQLite). Docker initialises a new
# named volume mounted here with this ownership, so the non-root user can write
# even though the container's root filesystem is read-only.
RUN mkdir -p /data && chown node:node /data

ENV PORT=4000
EXPOSE 4000

# Run as the non-root user that ships with the node image.
USER node

CMD ["node", "src/index.js"]
