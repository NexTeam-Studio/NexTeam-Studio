FROM node:20-bookworm-slim

WORKDIR /app

COPY . .

RUN npm ci
RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "start"]
