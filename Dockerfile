FROM node:22-alpine

RUN apk add --no-cache tini python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p database public/uploads

EXPOSE 5000

USER node

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "app.js"]
