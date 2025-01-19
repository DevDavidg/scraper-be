FROM node:18-slim

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-6 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY scraper/package*.json ./

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN npm install

COPY scraper/ .

EXPOSE 3000

CMD ["npm", "start"]
