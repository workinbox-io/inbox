FROM node:24-alpine
RUN apk add --no-cache isync openssl ca-certificates
WORKDIR /app/services/mail-bridge
COPY services/mail-bridge/package*.json ./
RUN npm ci --omit=dev
COPY services/mail-bridge/src ./src
COPY src/lib/mail/jmap.ts /app/src/lib/mail/jmap.ts
COPY src/lib/mail/outbox-policy.ts /app/src/lib/mail/outbox-policy.ts
COPY src/lib/mail/submission.ts /app/src/lib/mail/submission.ts
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8090
CMD ["node", "src/server.mjs"]
