FROM node:20-bookworm-slim

WORKDIR /app

COPY . .

RUN npm ci
RUN find . -path '*/node_modules/@google-cloud/firestore' -print && find . -path '*/node_modules/@google-cloud/firestore/types/firestore.d.ts' -print && exit 1
RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "start"]
