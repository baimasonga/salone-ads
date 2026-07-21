# Runs the existing Express server (server.ts) as a container, for the
# Cloudflare Containers deployment path (see worker/index.ts and
# docs/cloudflare-deployment.md). The Pages Functions path in /functions
# doesn't use this file at all.
#
# VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are baked into the built
# frontend at this build step by Vite, exactly like a local `npm run build`
# does — make sure a real .env file (see .env.example) exists in the build
# context before running `docker build` / `wrangler deploy`.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# --ignore-scripts: none of the actual runtime deps (express, supabase-js,
# dotenv, etc.) need install scripts — only esbuild's does, and esbuild
# isn't used at runtime, only in the build stage above. Skipping scripts
# here avoids a real npm bug: `--omit=dev`'s dependency-tree filtering trips
# over the nested esbuild version tsx (a devDependency) pulls in, failing
# esbuild's own postinstall binary-version check even though tsx itself is
# correctly excluded.
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
