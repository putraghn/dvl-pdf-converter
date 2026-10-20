FROM node:20-slim

# Ghostscript is required for the /compress endpoint.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ghostscript \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=4000
EXPOSE 4000

# Run as the non-root user that ships with the node image.
USER node

CMD ["node", "src/index.js"]
