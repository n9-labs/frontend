FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better caching
COPY package.json ./
COPY eslint.config.mjs ./
COPY next.config.ts ./
COPY postcss.config.mjs ./
COPY tsconfig.json ./

# Don't run repo-level postinstall (it installs Python deps for /agent)
RUN npm install --ignore-scripts

# Copy app source
COPY src ./src
COPY public ./public

EXPOSE 3000

# Dev server must bind to 0.0.0.0 inside containers.
# NOTE: We intentionally avoid Turbopack here because it can exit immediately
# under some container/compose setups.
CMD ["./node_modules/.bin/next", "dev", "--webpack", "--hostname", "0.0.0.0", "--port", "3000"]
