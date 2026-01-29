FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Minimal OS deps (curl for debugging / future installs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Install uv (used by this repo)
RUN pip install --no-cache-dir uv

# Copy dependency metadata first (better layer caching)
COPY pyproject.toml uv.lock langgraph.json ./

# Copy code (the project is installed from ".")
COPY main.py ./
COPY sample_agent.egg-info ./sample_agent.egg-info

# Pre-install deps into image (for non-bind-mount usage)
RUN uv sync --python 3.12

# Ensure venv executables are on PATH
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8123

# Entrypoint script that syncs deps then runs the server
# This handles the case where bind mounts override the pre-installed venv
CMD ["sh", "-c", "uv sync --python 3.12 && langgraph dev --host 0.0.0.0 --port 8123"]
