# CopilotKit <> LangGraph Starter

This is a starter template for building AI agents using [LangGraph](https://www.langchain.com/langgraph) and [CopilotKit](https://copilotkit.ai). It provides a modern Next.js application with an integrated LangGraph agent to be built on top of.

## Prerequisites

- Node.js 18+ 
- Python 3.8+
- Any of the following package managers:
  - [pnpm](https://pnpm.io/installation) (recommended)
  - npm
  - [yarn](https://classic.yarnpkg.com/lang/en/docs/install/#mac-stable)
  - [bun](https://bun.sh/)
- OpenAI API Key (for the LangGraph agent)

> **Note:** This repository ignores lock files (package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb) to avoid conflicts between different package managers. Each developer should generate their own lock file using their preferred package manager. After that, make sure to delete it from the .gitignore.

## Getting Started

1. Install dependencies using your preferred package manager:
```bash
# Using pnpm (recommended)
pnpm install

# Using npm
npm install

# Using yarn
yarn install

# Using bun
bun install
```

> **Note:** Installing the package dependencies will also install the agent's python dependencies via the `install:agent` script.


2. Set up your environment variables:
```bash
touch .env
```

Your `.env` file should contain:
```
OPENAI_API_KEY=your-openai-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
MODEL=model-for-your-agent
```

3. Start the development server:
```bash
# Using pnpm
pnpm dev

# Using npm
npm run dev

# Using yarn
yarn dev

# Using bun
bun run dev
```

This will start both the UI and agent servers concurrently.

## Available Scripts
The following scripts can also be run using your preferred package manager:
- `dev` - Starts both UI and agent servers in development mode
- `dev:debug` - Starts development servers with debug logging enabled
- `dev:ui` - Starts only the Next.js UI server
- `dev:agent` - Starts only the LangGraph agent server
- `build` - Builds the Next.js application for production
- `start` - Starts the production server
- `lint` - Runs ESLint for code linting
- `install:agent` - Installs Python dependencies for the agent

## Quick Start with Docker Compose

The fastest way to get running is with Docker Compose. This starts all services (UI, Agent, Neo4j) with a pre-populated database.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) or [Podman](https://podman.io/getting-started/installation)
- Docker Compose or Podman Compose
- An OpenAI or Anthropic API key
- If using Podman, ensure your VM has at least 6GB of memory:
  ```bash
  podman machine stop
  podman machine set --memory 6144
  podman machine start
  ```

### Step 1: Set Up Neo4j Data

The agent requires a pre-populated Neo4j database. Place the database files in `data/neo4jdata/`:

```
data/
  neo4jdata/
    databases/
      neo4j/
        ...
      system/
        ...
    transactions/
      ...
```

You can obtain the database files from:
- Ask a team member for the `neo4jdata` folder
- Or download from the shared drive (ask in Slack)

### Step 2: Configure Environment

Copy the example environment file and add your API key:

```bash
cp .env.example .env
```

Then edit `.env` and set your LLM API key:

```bash
# Required: Set ONE of these
OPENAI_API_KEY=your-openai-api-key
# or
ANTHROPIC_API_KEY=your-anthropic-api-key
```

See `.env.example` for all available configuration options.

### Step 3: Start Services

```bash
# Using Docker
docker compose up -d

# Or with Podman
podman-compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down
```

### Services

| Service | URL | Description |
|---------|-----|-------------|
| **UI** | http://localhost:3000 | Next.js frontend with CopilotKit |
| **Agent** | http://localhost:8123 | LangGraph agent server |
| **Neo4j Browser** | http://localhost:7474 | Graph database admin UI (no auth required) |

### Verify It's Working

1. Open http://localhost:7474 - You should see the Neo4j Browser
2. Run this query to verify data: `MATCH (n:JiraDocument) RETURN count(n)`
3. Open http://localhost:3000 - The UI should load
4. Ask the agent: "Who should I talk to about llm-d?"

### Development Workflow

The compose setup includes volume mounts for hot-reloading:
- UI: Changes to `src/` and `public/` are reflected immediately
- Agent: Changes to `agent/` trigger automatic reloads

To rebuild after dependency changes:
```bash
docker compose up -d --build
```

### Troubleshooting Docker Compose

**Neo4j fails to start:**
- Ensure `data/neo4jdata` exists and contains the database files
- Check that you're using Neo4j 2025 compatible data (the compose file uses `neo4j:2025`)

**Agent can't connect to Neo4j:**
- Verify Neo4j is running: `docker compose ps`
- Check logs: `docker compose logs neo4j`

**UI shows connection errors:**
- Wait for all services to fully start (can take 30-60 seconds)
- Check agent logs: `docker compose logs agent`

## Customization

The main UI component is in `src/app/page.tsx`. You can:
- Modify the theme colors and styling
- Add new frontend actions
- Customize the CopilotKit sidebar appearance

## Documentation

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/) - Learn more about LangGraph and its features
- [CopilotKit Documentation](https://docs.copilotkit.ai) - Explore CopilotKit's capabilities
- [Next.js Documentation](https://nextjs.org/docs) - Learn about Next.js features and API
- [YFinance Documentation](https://pypi.org/project/yfinance/) - Financial data tools

## Contributing

Feel free to submit issues and enhancement requests! This starter is designed to be easily extensible.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Troubleshooting

### Agent Connection Issues
If you see "I'm having trouble connecting to my tools", make sure:
1. The LangGraph agent is running on port 8123
2. Your OpenAI API key is set correctly in `.env`
3. Both servers started successfully

### Python Dependencies
If you encounter Python import errors:
```bash
npm run install:agent
```