# MLflow Setup in Docker Compose

This project includes MLflow for tracking agent performance and managing system prompts.

## Services

### MLflow Server
- **URL**: http://localhost:5001
- **Backend Store**: SQLite database in Docker volume
- **Artifacts**: Stored in Docker volume
- **Image**: ghcr.io/mlflow/mlflow:v2.19.0

## Quick Start

### 1. Start Services

```bash
docker compose up -d
```

This will start:
- MLflow server on port 5001
- Neo4j database
- LangGraph agent
- Next.js UI

### 2. Register System Prompt

After services are running:

```bash
./scripts/register-mlflow-prompt.sh
```

Or manually:

```bash
docker compose exec agent uv run python register_prompt.py \
  --name expert-finder-system-prompt \
  --alias production
```

### 3. Access MLflow UI

Open http://localhost:5001 in your browser to:
- View registered prompts
- Monitor agent traces (when tracing is enabled)
- Track experiments

## Configuration

The agent automatically connects to MLflow using these environment variables (set in `docker-compose.yml`):

```yaml
MLFLOW_TRACKING_URI=http://mlflow:5001
MLFLOW_EXPERIMENT_NAME=expert-finder-agent
MLFLOW_ENABLED=true
MLFLOW_PROMPT_NAME=expert-finder-system-prompt
MLFLOW_PROMPT_ALIAS=production
```

## Local Development

When running locally (outside Docker), use:

```bash
# Start MLflow locally
cd agent
uv run mlflow server --host 0.0.0.0 --port 5001 --backend-store-uri sqlite:///mlflow.db

# Register prompt locally
uv run python register_prompt.py --alias production
```

**Note**: Port 5001 is used instead of 5000 because macOS uses port 5000 for AirPlay Receiver.

## Tracing

MLflow tracing is configured with `@mlflow.trace` decorators on:
- `agent_node()` - Main LLM calls
- `tool_node()` - Tool executions

Traces are sent to MLflow and include:
- Function inputs and outputs
- Execution times
- Error information

### Viewing Traces

1. Open http://localhost:5001
2. Navigate to **Experiments** → `expert-finder-agent`
3. Click the **Traces** tab

## Prompt Management

### View Registered Prompts

http://localhost:5001/#/prompts

### Update System Prompt

```bash
# Edit the prompt
vim agent/register_prompt.py  # Or use --file flag

# Register new version
docker compose exec agent uv run python register_prompt.py \
  --name expert-finder-system-prompt \
  --alias staging \
  --commit "Updated prompt for better context handling"

# Promote to production
# (Use MLflow UI to set 'production' alias to the new version)
```

### Version Control

MLflow automatically versions all prompt changes. Each registration creates a new version with:
- Timestamp
- Commit message
- Full prompt content

## Volumes

MLflow data persists in Docker volume:

```bash
# List volumes
docker volume ls | grep mlflow

# Inspect volume
docker volume inspect hack-frontend_mlflow_data

# Backup (optional)
docker compose exec mlflow tar -czf /tmp/mlflow-backup.tar.gz /mlflow
docker compose cp mlflow:/tmp/mlflow-backup.tar.gz ./backups/
```

## Troubleshooting

### MLflow not starting

```bash
# Check logs
docker compose logs mlflow

# Restart service
docker compose restart mlflow
```

### Prompt not loading

```bash
# Check agent logs
docker compose logs agent | grep MLflow

# Re-register prompt
./scripts/register-mlflow-prompt.sh
```

### Blocking warnings in LangGraph

The `@mlflow.trace` decorator makes synchronous HTTP calls. To suppress warnings:

```yaml
# In docker-compose.yml, add to agent environment:
- BG_JOB_ISOLATED_LOOPS=true
```

Or in the LangGraph CLI:

```bash
langgraph dev --allow-blocking
```
