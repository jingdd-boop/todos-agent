FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY prisma ./prisma
COPY tsconfig.json prisma.config.ts ./
COPY src ./src
RUN pnpm exec prisma generate

RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/app/data/todo.db

EXPOSE 3000

CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm start"]
