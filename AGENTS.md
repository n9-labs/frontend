# Expert Finder - Agent Documentation

This document provides context for AI agents (Cursor, Copilot, etc.) working on this codebase.

## Project Overview

**Expert Finder** is a Next.js application that helps users find subject matter experts within an organization by querying a Neo4j graph database of JIRA tickets. It uses CopilotKit for the chat UI and a LangGraph Python agent for intelligent querying.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js UI    │────▶│  LangGraph      │────▶│    Neo4j        │
│  (CopilotKit)   │     │  Agent          │     │  Graph DB       │
│  localhost:3000 │     │  localhost:8123 │     │  localhost:7687 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Key Files

### Frontend (Next.js)

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main UI - Landing page + Chat interface |
| `src/app/layout.tsx` | Root layout with CopilotKit provider |
| `src/app/api/copilotkit/route.ts` | API route connecting to LangGraph agent |
| `src/app/globals.css` | Global styles including CopilotKit overrides |

### Agent (Python/LangGraph)

| File | Purpose |
|------|---------|
| `agent/main.py` | LangGraph agent with Neo4j tools |
| `agent/pyproject.toml` | Python dependencies |

### Configuration

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Multi-container setup (UI, Agent, Neo4j) |
| `Dockerfile` | Next.js container build |
| `.env` / `.env.example` | Environment variables |

### Testing

| File | Purpose |
|------|---------|
| `tests/unit/` | Jest unit tests |
| `tests/e2e/` | Playwright E2E tests |
| `jest.config.ts` | Jest configuration |
| `playwright.config.ts` | Playwright configuration |
| `.github/workflows/ci.yml` | GitHub Actions CI pipeline |

## Common Tasks

### Adding a New Tool to the Agent

1. Edit `agent/main.py`
2. Add a new `@tool` decorated function
3. Add it to the `tools` list
4. Update `SYSTEM_PROMPT` to document the tool
5. Restart the agent container: `podman restart frontend-agent-1`

### Modifying the Chat UI

1. Edit `src/app/page.tsx`
2. The `ChatContent` component handles the chat view
3. The `LandingPage` component is the initial search page
4. CopilotKit styling is in `src/app/globals.css`

### Adding a Test

**Unit test:**
```bash
# Create test in tests/unit/
# Run: npm run test
```

**E2E test:**
```bash
# Create test in tests/e2e/
# Run: npm run test:e2e
```

## Important Patterns

### Preventing Duplicate Messages

The `ChatContent` component uses a ref-based guard to prevent sending the initial message twice:

```typescript
const messageSent = useRef(false);

useEffect(() => {
  if (messageSent.current) return;
  messageSent.current = true;  // Set BEFORE async operation
  await appendMessage(...);
}, [...]);
```

### CopilotKit Dark Theme

Custom styles override CopilotKit defaults in `globals.css`:
- `.copilotKitChat` - Main chat container
- `.copilotKitInput` - Input area (has flexbox centering)
- `.copilotKitHeader` - Hidden (we use custom header)

### Tool Visualization

The `useDefaultTool` hook in `page.tsx` customizes how tool calls appear in chat. JIRA tools get special rendering with status indicators.

## Development Commands

```bash
# Start everything (UI + Agent)
npm run dev

# Start with Docker/Podman
podman-compose up -d

# Run tests
npm run test        # Unit tests
npm run test:e2e    # E2E tests
npm run test:all    # Both

# Lint
npm run lint

# Build for production
npm run build
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes* | OpenAI API key |
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key |
| `MODEL` | No | Model name (default: gpt-4o) |
| `NEO4J_URI` | No | Neo4j connection (default: bolt://localhost:7687) |

*At least one LLM API key is required.

## Container Architecture

When running with Docker/Podman:

| Container | Port | Health Check |
|-----------|------|--------------|
| `frontend-ui-1` | 3000 | HTTP 200 |
| `frontend-agent-1` | 8123 | - |
| `frontend-neo4j-1` | 7474, 7687 | HTTP 7474 |

The agent waits for Neo4j to be healthy before starting (prevents race conditions).

## Testing Guidelines

### Unit Tests (Jest)
- Mock CopilotKit hooks
- Test component logic in isolation
- Focus on race conditions and edge cases

### E2E Tests (Playwright)
- Test user flows through the real UI
- Visual regression tests for layout
- Run against `localhost:3000`

### CI Pipeline
1. Lint (ESLint)
2. Unit Tests (Jest + coverage)
3. Build (Next.js production)
4. E2E Tests (Playwright)

## Known Issues / Gotchas

1. **Hot reload in containers**: The UI hot-reloads, but agent changes require container restart
2. **Playwright browsers**: Use `PLAYWRIGHT_BROWSERS_PATH=0` to store browsers in `node_modules`
3. **Neo4j data**: Must be pre-populated - get `data/neo4jdata/` from a team member
4. **CopilotKit web inspector**: Hidden via CSS (`cpk-web-inspector { display: none }`)

## File Patterns to Ignore

When searching/editing, these are generated/cached:
- `.next/` - Next.js build output
- `node_modules/` - Dependencies
- `coverage/` - Test coverage reports
- `test-results/` - Playwright artifacts
- `playwright-report/` - Playwright HTML reports
- `data/neo4jdata/` - Neo4j database files
