# Configuration

Org Chat uses environment variables for configuration. Copy `.env.example` to `.env` and customize as needed.

## LLM API Keys

You must set **one** of these (not both):

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for GPT models |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude models |

## Model Selection

| Variable | Default | Description |
|----------|---------|-------------|
| `N9_AGENT_MODEL` | `claude-sonnet-4-5` | LLM model to use for the agent. Examples: `gpt-4o`, `gpt-4o-mini`, `claude-sonnet-4-5` |

## Neo4j Database

| Variable | Default | Description |
|----------|---------|-------------|
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j connection URI |
| `NEO4J_USERNAME` | *(empty)* | Neo4j username. Leave empty for local docker-compose (auth disabled) |
| `NEO4J_PASSWORD` | *(empty)* | Neo4j password. Leave empty for local docker-compose (auth disabled) |

## Atlassian Integration

Optional integration for live Jira/Confluence access. Choose the auth method matching your Jira deployment:

### Jira Server/Data Center (on-prem)

| Variable | Description |
|----------|-------------|
| `JIRA_URL` | Jira instance URL (e.g., `https://issues.redhat.com`) |
| `JIRA_PERSONAL_TOKEN` | Personal access token for authentication |

### Jira Cloud

| Variable | Description |
|----------|-------------|
| `JIRA_URL` | Jira Cloud URL (e.g., `https://your-org.atlassian.net`) |
| `JIRA_USERNAME` | Your email address |
| `JIRA_API_TOKEN` | API token (generate at [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)) |

### Confluence

| Variable | Description |
|----------|-------------|
| `CONFLUENCE_URL` | Confluence instance URL |
| `CONFLUENCE_PERSONAL_TOKEN` | Personal access token |

## Testing

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_E2E_TEST_MODE` | `false` | Disables CopilotKit agent connection. Used for running Playwright E2E tests without a backend. Set at build time: `NEXT_PUBLIC_E2E_TEST_MODE=true npm run build` |
