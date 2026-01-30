#!/bin/bash
# Register the system prompt in MLflow running in docker-compose

set -e

echo "🚀 Registering system prompt in MLflow..."

# Wait for MLflow to be ready
echo "⏳ Waiting for MLflow service..."
timeout 30 bash -c 'until curl -sf http://localhost:5001/health > /dev/null 2>&1; do sleep 1; done' || {
    echo "❌ MLflow service not ready after 30 seconds"
    exit 1
}

echo "✅ MLflow is ready"

# Register the prompt using the agent container (which has uv and the register script)
docker compose exec agent uv run python register_prompt.py \
    --name expert-finder-system-prompt \
    --alias production \
    --commit "Initial registration via docker-compose"

echo "✅ Prompt registered successfully!"
echo "📊 View at: http://localhost:5001/#/prompts/expert-finder-system-prompt"
