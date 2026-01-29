FROM node:20-alpine

WORKDIR /app

# Use pnpm (matches local workflow)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies first for better caching
COPY package.json ./
COPY eslint.config.mjs ./
COPY next.config.ts ./
COPY postcss.config.mjs ./
COPY tsconfig.json ./

# Don't run repo-level postinstall (it installs Python deps for /agent)
RUN pnpm install --ignore-scripts

# Copy app source
COPY src ./src
COPY public ./public

EXPOSE 3000

# Dev server must bind to 0.0.0.0 inside containers.
# Using webpack instead of turbopack for container compatibility.
CMD ["pnpm", "exec", "next", "dev", "--webpack", "--hostname", "0.0.0.0", "--port", "3000"]
