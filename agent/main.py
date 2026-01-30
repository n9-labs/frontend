"""
Org Chat Agent - Finds the right people to talk to about features
Uses RAG search and graph traversal to identify experts from JIRA data
Integrates with Atlassian MCP server for real Jira/Confluence access

Built using LangGraph Graph API (StateGraph) for explicit control over
the agent workflow, nodes, and edges.

Includes MLflow tracing for observability and prompt registry for
version-controlled system prompts.
"""

import asyncio
import uuid
import logging
from typing import List, Literal, Optional
from pydantic import BaseModel, Field, model_validator
from pydantic_settings import BaseSettings  # type: ignore
from langchain.tools import tool
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.sessions import Connection
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from copilotkit import CopilotKitState
from copilotkit.langgraph import copilotkit_customize_config

# MLflow imports for tracing and prompt registry
import mlflow
import mlflow.langchain


class Settings(BaseSettings):
    """Centralized env-driven configuration for local/dev deploys."""

    # Load from agent/.env if present, plus real env vars.
    model_config = {"env_file": ".env", "extra": "ignore"}

    # API key (assume good intent):
    # - exactly one of OPENAI_API_KEY or ANTHROPIC_API_KEY must be set
    openai_api_key: str = Field(default="", validation_alias="OPENAI_API_KEY")
    anthropic_api_key: str = Field(default="", validation_alias="ANTHROPIC_API_KEY")
    api_key: str = Field(default="")

    # MLflow configuration
    # Note: macOS uses port 5000 for AirPlay Receiver, so we use 5001 by default
    mlflow_tracking_uri: str = Field(
        default="http://localhost:5001", validation_alias="MLFLOW_TRACKING_URI"
    )
    mlflow_experiment_name: str = Field(
        default="expert-finder-agent", validation_alias="MLFLOW_EXPERIMENT_NAME"
    )
    mlflow_enabled: bool = Field(default=True, validation_alias="MLFLOW_ENABLED")
    mlflow_prompt_name: str = Field(
        default="expert-finder-system-prompt", validation_alias="MLFLOW_PROMPT_NAME"
    )
    mlflow_prompt_alias: str = Field(
        default="production", validation_alias="MLFLOW_PROMPT_ALIAS"
    )

    # Agent/model
    model: str = Field(default="claude-sonnet-4-5", validation_alias="N9_AGENT_MODEL")

    # Neo4j connection (for graph database)
    # If username/password are empty, connects without auth (for local dev)
    neo4j_uri: str = Field(
        default="bolt://localhost:7687", validation_alias="NEO4J_URI"
    )
    neo4j_username: str = Field(default="", validation_alias="NEO4J_USERNAME")
    neo4j_password: str = Field(default="", validation_alias="NEO4J_PASSWORD")

    # Atlassian MCP (Jira required; Confluence optional)
    jira_url: str = Field(default="", validation_alias="JIRA_URL")
    jira_username: str = Field(default="", validation_alias="JIRA_USERNAME")
    jira_api_token: str = Field(default="", validation_alias="JIRA_API_TOKEN")
    jira_personal_token: str = Field(default="", validation_alias="JIRA_PERSONAL_TOKEN")

    confluence_url: str = Field(default="", validation_alias="CONFLUENCE_URL")
    confluence_username: str = Field(default="", validation_alias="CONFLUENCE_USERNAME")
    confluence_api_token: str = Field(
        default="", validation_alias="CONFLUENCE_API_TOKEN"
    )
    confluence_personal_token: str = Field(
        default="", validation_alias="CONFLUENCE_PERSONAL_TOKEN"
    )

    @model_validator(mode="after")
    def _resolve_api_key(self) -> "Settings":
        openai = (self.openai_api_key or "").strip()
        anthropic = (self.anthropic_api_key or "").strip()

        provided = [k for k in (openai, anthropic) if k]
        if len(provided) == 0:
            raise ValueError(
                "Missing API key: set exactly one of OPENAI_API_KEY or ANTHROPIC_API_KEY."
            )
        if len(provided) > 1:
            raise ValueError(
                "Ambiguous API key: set only one of OPENAI_API_KEY or ANTHROPIC_API_KEY (not both)."
            )

        self.api_key = provided[0]
        return self


settings = Settings()


# ---------------------------------------------------------------------------
# MLflow Tracing Initialization (runs at module load)
# ---------------------------------------------------------------------------

_mlflow_initialized = False


def init_mlflow_tracing():
    """
    Initialize MLflow tracing for LangChain/LangGraph.
    
    This sets up:
    1. MLflow tracking URI for trace storage
    2. Experiment name for organizing traces
    3. LangChain autolog for automatic tracing of all LLM calls
    
    Note: Prompt loading is done separately via get_system_prompt() 
    after DEFAULT_SYSTEM_PROMPT is defined.
    """
    global _mlflow_initialized
    
    if _mlflow_initialized:
        return
    
    if not settings.mlflow_enabled:
        print("[INFO] MLflow tracing is disabled (MLFLOW_ENABLED=false)")
        _mlflow_initialized = True
        return
    
    try:
        # Configure MLflow tracking
        mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
        mlflow.set_experiment(settings.mlflow_experiment_name)
        
        # Enable autolog for automatic LangGraph tracing
        # This creates one trace per graph execution with all nodes as spans
        # Note: OpenTelemetry warnings are suppressed via logging config at module top
        mlflow.langchain.autolog(run_tracer_inline=True, silent=True)
        
        print(f"[OK] MLflow tracing enabled:")
        print(f"     Tracking URI: {settings.mlflow_tracking_uri}")
        print(f"     Experiment: {settings.mlflow_experiment_name}")
        print(f"     Tracing: langchain.autolog() (warnings suppressed)")
        
        _mlflow_initialized = True
        
    except Exception as e:
        print(f"[WARN] Failed to initialize MLflow tracing: {e}")
        print("[INFO] Continuing without MLflow tracing")
        _mlflow_initialized = True


# Initialize MLflow tracing at module load (before prompt is defined)
init_mlflow_tracing()


# Neo4j driver (lazy initialization)
_neo4j_driver = None


def get_neo4j_driver():
    """Get or create Neo4j driver connection."""
    global _neo4j_driver
    if _neo4j_driver is None:
        try:
            from neo4j import GraphDatabase  # type: ignore[import-untyped]

            # Handle auth - if username/password are empty, use no auth
            auth = None
            if settings.neo4j_username and settings.neo4j_password:
                auth = (settings.neo4j_username, settings.neo4j_password)

            _neo4j_driver = GraphDatabase.driver(settings.neo4j_uri, auth=auth)
            # Verify connectivity
            _neo4j_driver.verify_connectivity()
            auth_status = "with auth" if auth else "without auth"
            print(f"[OK] Connected to Neo4j at {settings.neo4j_uri} ({auth_status})")
        except Exception as e:
            print(f"[WARN] Failed to connect to Neo4j: {e}")
            return None
    return _neo4j_driver


class Person(BaseModel):
    name: str
    email: str
    slack_id: Optional[str] = None


class Jira(BaseModel):
    id: str
    type: str  # EPIC, STORY, RFE, BUG, TASK
    summary: str
    description: Optional[str] = None
    assignee: Optional[Person] = None
    reporter: Optional[Person] = None
    components: List[str] = []
    team: Optional[str] = None
    status: str


class Expert(BaseModel):
    person: Person
    inferred_role: str
    team: Optional[str] = None
    confidence: str  # high, medium, low
    reasoning: str
    linked_jiras: List[str]


class ExpertFinderState(CopilotKitState):
    """
    LangGraph agent state schema extending CopilotKitState.

    CopilotKitState already includes:
    - messages: List of messages (from MessagesState)
    - copilotkit: CopilotKit properties (actions, context, etc.)
    """

    query: str
    rag_results: List[Jira]
    graph_results: List[Jira]
    experts: List[Expert]
    search_phase: str
    error: Optional[str] = None  # Store error messages for frontend display


def make_initial_state(user_message: str) -> dict:
    """
    Canonical local initializer for this agent's runtime state dict.

    When you run via CopilotKit, the `copilotkit` key is typically provided upstream.
    For local runs/tests, we seed it with empty actions/context.
    """

    return {
        "messages": [HumanMessage(content=user_message)],
        "copilotkit": {
            "actions": [],
            "context": [],
            "intercepted_tool_calls": None,
            "original_ai_message_id": None,
        },
        "query": "",
        "rag_results": [],
        "graph_results": [],
        "experts": [],
        "search_phase": "idle",
    }


@tool
def search_jira_text(query: str, limit: int = 10) -> str:
    """
    Search for JIRAs in Neo4j using text matching on title and text fields.
    Use this for keyword-based searches.

    Args:
        query: The search query (e.g., "observability dashboard", "llm-d")
        limit: Maximum number of results to return (default 10)

    Returns:
        Summary of JIRA issues that match the query
    """
    driver = get_neo4j_driver()
    if driver is None:
        return "Error: Unable to connect to Neo4j database"

    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (j:JiraDocument)
                WHERE toLower(j.title) CONTAINS toLower($query)
                   OR toLower(j.text) CONTAINS toLower($query)
                RETURN DISTINCT j.key as key, j.title as title, j.issue_type as issue_type,
                       j.status as status, j.assignee as assignee, j.reporter as reporter,
                       j.project as project, j.labels as labels, j.priority as priority,
                       j.url as url, j.updated_at as updated_at
                ORDER BY updated_at DESC
                LIMIT $limit
                """,
                query=query,
                limit=limit,
            )

            records = list(result)
            if not records:
                return f"No JIRAs found matching '{query}'"

            output = f"Found {len(records)} JIRAs matching '{query}':\n\n"
            for record in records:
                output += (
                    f"**{record['key']}** ({record['issue_type']}): {record['title']}\n"
                )
                if record["assignee"]:
                    output += f"  Assignee: {record['assignee']}\n"
                if record["reporter"]:
                    output += f"  Reporter: {record['reporter']}\n"
                output += f"  Project: {record['project']}\n"
                if record["labels"]:
                    output += f"  Labels: {', '.join(record['labels'])}\n"
                output += (
                    f"  Status: {record['status']} | Priority: {record['priority']}\n"
                )
                if record["url"]:
                    output += f"  URL: {record['url']}\n"
                output += "\n"

            return output

    except Exception as e:
        return f"Error searching Neo4j: {e}"


@tool
def search_jira_semantic(query: str, limit: int = 10) -> str:
    """
    Search for JIRAs using semantic/vector similarity search.
    This finds JIRAs that are conceptually similar to your query, even if they
    don't contain the exact keywords. Requires generating an embedding for the query.

    Note: This tool requires the query to be embedded first. For now, use search_jira_text
    for keyword-based searches.

    Args:
        query: The semantic search query (e.g., "how to monitor AI model performance")
        limit: Maximum number of results to return (default 10)

    Returns:
        Summary of semantically similar JIRA issues
    """
    driver = get_neo4j_driver()
    if driver is None:
        return "Error: Unable to connect to Neo4j database"

    # TODO: Integrate with embedding model (OpenAI, etc.) to generate query embedding
    # For now, fall back to text search
    return search_jira_text.invoke({"query": query, "limit": limit})


@tool
def get_jira_details(jira_key: str) -> str:
    """
    Get full details of a specific JIRA by its key.

    Args:
        jira_key: The JIRA key (e.g., "RHAIRFE-1237")

    Returns:
        Full details of the JIRA including description
    """
    driver = get_neo4j_driver()
    if driver is None:
        return "Error: Unable to connect to Neo4j database"

    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (j:JiraDocument)
                WHERE j.key = $jira_key
                RETURN j.key as key, j.title as title, j.text as text,
                       j.issue_type as issue_type, j.status as status,
                       j.assignee as assignee, j.reporter as reporter,
                       j.project as project, j.labels as labels,
                       j.priority as priority, j.url as url,
                       j.created_at as created_at, j.updated_at as updated_at
                """,
                jira_key=jira_key,
            )

            record = result.single()
            if not record:
                return f"No JIRA found with key: {jira_key}"

            output = f"**{record['key']}** ({record['issue_type']})\n"
            output += f"# {record['title']}\n\n"
            output += (
                f"**Status:** {record['status']} | **Priority:** {record['priority']}\n"
            )
            output += f"**Project:** {record['project']}\n"
            if record["assignee"]:
                output += f"**Assignee:** {record['assignee']}\n"
            if record["reporter"]:
                output += f"**Reporter:** {record['reporter']}\n"
            if record["labels"]:
                output += f"**Labels:** {', '.join(record['labels'])}\n"
            if record["url"]:
                output += f"**URL:** {record['url']}\n"
            output += f"**Created:** {record['created_at']} | **Updated:** {record['updated_at']}\n\n"
            output += "---\n\n"
            # Extract just the description part from text
            text = record["text"] or ""
            if "description:" in text:
                desc_start = text.find("description:") + len("description:")
                desc_end = text.find("date_created:")
                if desc_end > desc_start:
                    output += text[desc_start:desc_end].strip()
                else:
                    output += text[desc_start:].strip()
            else:
                output += text[:2000]  # Limit output size

            return output

    except Exception as e:
        return f"Error getting JIRA details: {e}"


@tool
def find_experts_by_topic(topic: str, limit: int = 10) -> str:
    """
    Find people who are experts on a topic by analyzing JIRA assignments.
    Returns people ranked by how many related JIRAs they've worked on.

    Args:
        topic: The topic to find experts for (e.g., "observability", "llm-d", "vLLM")
        limit: Maximum number of experts to return (default 10)

    Returns:
        List of experts with their involvement details
    """
    driver = get_neo4j_driver()
    if driver is None:
        return "Error: Unable to connect to Neo4j database"

    try:
        with driver.session() as session:
            # Find JIRAs matching the topic and aggregate by assignee
            result = session.run(
                """
                MATCH (j:JiraDocument)
                WHERE toLower(j.title) CONTAINS toLower($topic)
                   OR toLower(j.text) CONTAINS toLower($topic)
                WITH j
                WHERE j.assignee IS NOT NULL AND j.assignee <> ''
                WITH j.assignee as person,
                     count(DISTINCT j) as jira_count,
                     collect(DISTINCT j.key)[0..5] as sample_jiras,
                     collect(DISTINCT j.issue_type) as issue_types,
                     collect(DISTINCT j.project)[0..3] as projects
                ORDER BY jira_count DESC
                LIMIT $limit
                RETURN person, jira_count, sample_jiras, issue_types, projects
                """,
                topic=topic,
                limit=limit,
            )

            records = list(result)
            if not records:
                return f"No experts found for topic: '{topic}'"

            output = f"Found {len(records)} experts for topic '{topic}':\n\n"
            for record in records:
                output += f"**{record['person']}**\n"
                output += f"  JIRAs on this topic: {record['jira_count']}\n"
                output += f"  Issue types: {', '.join(record['issue_types'])}\n"
                output += f"  Projects: {', '.join(record['projects'])}\n"
                output += f"  Sample JIRAs: {', '.join(record['sample_jiras'])}\n\n"

            return output

    except Exception as e:
        return f"Error finding experts: {e}"


@tool
def find_jiras_by_person(person_name: str, limit: int = 10) -> str:
    """
    Find JIRAs that a specific person is working on or has worked on.
    Searches by assignee name (case-insensitive partial match).

    Args:
        person_name: The name of the person to search for (e.g., "Russell Bryant", "Bryant")
        limit: Maximum number of JIRAs to return (default 10)

    Returns:
        List of JIRAs assigned to or reported by that person
    """
    driver = get_neo4j_driver()
    if driver is None:
        return "Error: Unable to connect to Neo4j database"

    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (j:JiraDocument)
                WHERE toLower(j.assignee) CONTAINS toLower($person_name)
                   OR toLower(j.reporter) CONTAINS toLower($person_name)
                RETURN DISTINCT j.key as key, j.title as title, j.issue_type as issue_type,
                       j.status as status, j.assignee as assignee, j.reporter as reporter,
                       j.project as project, j.labels as labels, j.priority as priority,
                       j.url as url, j.updated_at as updated_at
                ORDER BY updated_at DESC
                LIMIT $limit
                """,
                person_name=person_name,
                limit=limit,
            )

            records = list(result)
            if not records:
                return f"No JIRAs found for person: '{person_name}'"

            output = f"Found {len(records)} JIRAs for '{person_name}':\n\n"
            for record in records:
                output += (
                    f"**{record['key']}** ({record['issue_type']}): {record['title']}\n"
                )
                if record["assignee"]:
                    output += f"  Assignee: {record['assignee']}\n"
                if record["reporter"]:
                    output += f"  Reporter: {record['reporter']}\n"
                output += f"  Project: {record['project']}\n"
                if record["labels"]:
                    output += f"  Labels: {', '.join(record['labels'])}\n"
                output += (
                    f"  Status: {record['status']} | Priority: {record['priority']}\n"
                )
                if record["url"]:
                    output += f"  URL: {record['url']}\n"
                output += "\n"

            return output

    except Exception as e:
        return f"Error finding JIRAs for person: {e}"


@tool
def find_experts_by_label(labels: List[str], limit: int = 10) -> str:
    """
    Find people who are experts based on JIRA labels.
    Returns people ranked by how many JIRAs with those labels they've worked on.

    Args:
        labels: List of labels to search for (e.g., ["MaaS", "llm-d"])
        limit: Maximum number of experts to return (default 10)

    Returns:
        List of experts with their involvement details
    """
    driver = get_neo4j_driver()
    if driver is None:
        return "Error: Unable to connect to Neo4j database"

    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (j:JiraDocument)
                WHERE any(label IN j.labels WHERE label IN $labels)
                WITH j
                WHERE j.assignee IS NOT NULL AND j.assignee <> ''
                WITH j.assignee as person,
                     count(DISTINCT j) as jira_count,
                     collect(DISTINCT j.key)[0..5] as sample_jiras,
                     collect(DISTINCT j.issue_type) as issue_types,
                     [label IN collect(j.labels) WHERE label IN $labels] as matched_labels
                ORDER BY jira_count DESC
                LIMIT $limit
                RETURN person, jira_count, sample_jiras, issue_types
                """,
                labels=labels,
                limit=limit,
            )

            records = list(result)
            if not records:
                return f"No experts found for labels: {labels}"

            output = f"Found {len(records)} experts for labels {labels}:\n\n"
            for record in records:
                output += f"**{record['person']}**\n"
                output += f"  JIRAs with these labels: {record['jira_count']}\n"
                output += f"  Issue types: {', '.join(record['issue_types'])}\n"
                output += f"  Sample JIRAs: {', '.join(record['sample_jiras'])}\n\n"

            return output

    except Exception as e:
        return f"Error finding experts: {e}"


@tool
def list_jira_labels() -> str:
    """
    List all unique labels used in JIRAs with their counts.
    Useful to understand what labels/categories exist in the data.

    Returns:
        List of labels with counts
    """
    driver = get_neo4j_driver()
    if driver is None:
        return "Error: Unable to connect to Neo4j database"

    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (j:JiraDocument)
                UNWIND j.labels as label
                WITH label, count(*) as count
                ORDER BY count DESC
                LIMIT 50
                RETURN label, count
                """
            )

            records = list(result)
            if not records:
                return "No labels found in the database"

            output = "JIRA Labels (top 50):\n\n"
            for record in records:
                output += f"- **{record['label']}**: {record['count']} JIRAs\n"

            return output

    except Exception as e:
        return f"Error listing labels: {e}"


# Default system prompt with role inference guidelines (fallback if MLflow unavailable)
DEFAULT_SYSTEM_PROMPT = """You are an expert finder for Red Hat AI. Your job is to help users 
find the right people to talk to about features, products, or technical questions.

## Available Tools

### Neo4j JIRA Search Tools
The database contains JIRAs from Red Hat AI projects with these properties:
- key: JIRA ID (e.g., "RHAIRFE-1237", "RHAISTRAT-1077")
- title: Issue summary
- text: Full content with description
- issue_type: Feature Request, Story, Feature, Task, Epic, Sub-task, Outcome, Initiative, Bug
- status: Issue status (New, Approved, Closed, etc.)
- assignee: Person assigned (name string, may be empty)
- reporter: Person who reported (name string)
- project: Project name (e.g., "Red Hat AI RFE project", "Red Hat AI Strategy Project")
- labels: Array of labels (e.g., ["MaaS", "llm-d", "3.4-candidate"])
- priority: Priority level (Critical, Major, Undefined, etc.)

**Tools:**
- **search_jira_text(query, limit)**: Keyword search on JIRA titles and content
- **find_experts_by_topic(topic, limit)**: Find people ranked by JIRAs on a topic
- **find_experts_by_label(labels, limit)**: Find people by JIRA labels
- **find_jiras_by_person(person_name, limit)**: Find JIRAs assigned to or reported by a person
- **get_jira_details(jira_key)**: Get full details of a specific JIRA
- **list_jira_labels()**: See all available labels in the database

## Your Workflow

1. **Understand the Query**: When a user asks "Who should I talk to about [topic]?", 
   extract the key concepts (e.g., "llm-d", "observability", "autoscaling").

2. **Find Experts Directly**: Use `find_experts_by_topic` with relevant keywords.
   This returns people ranked by how many related JIRAs they've worked on.
   
   Example: find_experts_by_topic("llm-d") -> Returns top contributors to llm-d work

3. **Use Labels for Specific Areas**: If you know the label, use `find_experts_by_label`.
   Common labels include: "MaaS", "llm-d", "3.4-candidate", "tech-reviewed"
   
   Example: find_experts_by_label(["MaaS"]) -> Returns experts in MaaS area

4. **Find What Someone is Working On**: When asked "What is [person] working on?", use 
   `find_jiras_by_person` to find JIRAs assigned to or reported by that person.
   
   Example: find_jiras_by_person("Russell Bryant") -> Returns JIRAs Russell is working on

5. **Search for Context**: Use `search_jira_text` to find relevant JIRAs and understand
   what work is being done. Then use `get_jira_details` for full descriptions.

6. **Synthesize Results**: Combine findings to recommend the best contacts.

## Role Inference Guidelines

Use issue types and context to infer roles:

- **Feature Request / Feature**: Often owned by **Product Managers** or **Tech Leads**
  - These define what should be built
  - The assignee is likely the feature owner or PM
  
- **Outcome / Initiative**: Usually owned by **Strategy** or **Leadership**
  - High-level goals and directions
  - Assignees are typically senior leaders or PMs

- **Story / Task / Sub-task**: Usually assigned to **Developers** or **Engineers**
  - Implementation work
  - The assignee is doing the hands-on work

- **Epic**: Owned by **Feature Leads** or **Engineering Managers**
  - Coordinates multiple stories/tasks
  
- **Bug**: Assigned to **Developers** for fixing
  - Reporter may be QE or customer-facing team

## Confidence Levels

- **High**: Person has 5+ JIRAs on the topic, clear ownership pattern
- **Medium**: Person has 2-4 JIRAs, some ownership signals
- **Low**: Only 1 JIRA or unclear context

## Output Format

For each expert, format as follows with a BLANK LINE between each person:

**[Name]**
- Role Inference: [role] ([confidence] Confidence)
- JIRAs: [count]
- Projects: [project names]
- Sample JIRA Keys: [keys]
- Reasoning: [brief explanation]

[blank line before next person]

**[Next Name]**
...

IMPORTANT: Always include a blank line between each expert entry for readability.

Be concise but informative. If multiple people are relevant, rank them by expertise level.

## CRITICAL: When to Stop

DO NOT keep calling tools endlessly. Follow this rule:

1. Call find_experts_by_topic ONCE with the main topic
2. If you get results, STOP and synthesize your answer immediately
3. Only call additional tools if the first search returned zero results
4. Maximum 3 tool calls per query - then you MUST provide your best answer
5. If you have ANY relevant experts, provide your answer - do not keep searching for "better" results

## Collecting Feedback

After providing your complete answer, you can optionally call the `request_feedback` tool to collect
user satisfaction data. This helps improve the system over time.

Example:
- Provide your expert recommendations
- Then call: request_feedback(response_text="summary of what you told them", question="Was this helpful?")
- The user will see a feedback card and can rate your response"""


def _load_prompt_from_mlflow() -> str:
    """
    Load the system prompt from MLflow Prompt Registry.
    
    IMPORTANT: This must be called at MODULE INITIALIZATION TIME, not inside
    async functions. The MLflow SDK uses synchronous HTTP calls which will be
    blocked by LangGraph's async runtime if called inside agent nodes.
    
    Returns:
        The system prompt string from MLflow, or the default if unavailable.
    """
    if not settings.mlflow_enabled:
        print("[INFO] MLflow prompt registry disabled (MLFLOW_ENABLED=false)")
        return DEFAULT_SYSTEM_PROMPT

    try:
        # Try to load from MLflow prompt registry (MLflow 3.x API)
        # Format for alias: "prompts:/<prompt_name>@<alias>"
        prompt_uri = f"prompts:/{settings.mlflow_prompt_name}@{settings.mlflow_prompt_alias}"
        prompt = mlflow.genai.load_prompt(prompt_uri)
        print(f"[OK] Loaded system prompt from MLflow: {prompt_uri}")
        return prompt.template
    except Exception as e:
        print(f"[WARN] Could not load prompt from MLflow: {e}")
        print("[INFO] Using default system prompt - run 'python register_prompt.py' to register it in MLflow")
        return DEFAULT_SYSTEM_PROMPT


# EAGER LOAD: Load the system prompt at module initialization time
# This avoids blocking calls inside async agent nodes
SYSTEM_PROMPT = _load_prompt_from_mlflow()


def load_system_prompt() -> str:
    """Get the cached system prompt (already loaded at module init)."""
    return SYSTEM_PROMPT


# MCP server configuration for Atlassian tools
# Uses environment variables for authentication
# Supports both Cloud (username + API token) and Server/Data Center (Personal Access Token)
# Note: langchain-mcp-adapters v0.1.0+ requires "transport" key in config
MCP_SERVERS: dict[str, Connection] = {
    "atlassian": {
        "transport": "stdio",  # Required for v0.1.0+
        "command": "uvx",
        "args": ["mcp-atlassian"],
        "env": {
            # Jira URL (required)
            "JIRA_URL": settings.jira_url,
            # For Jira Cloud: use USERNAME + API_TOKEN
            "JIRA_USERNAME": settings.jira_username,
            "JIRA_API_TOKEN": settings.jira_api_token,
            # For Jira Server/Data Center (on-prem): use PERSONAL_TOKEN instead
            "JIRA_PERSONAL_TOKEN": settings.jira_personal_token,
            # Confluence (optional)
            "CONFLUENCE_URL": settings.confluence_url,
            "CONFLUENCE_USERNAME": settings.confluence_username,
            "CONFLUENCE_API_TOKEN": settings.confluence_api_token,
            "CONFLUENCE_PERSONAL_TOKEN": settings.confluence_personal_token,
        },
    }
}


async def load_tools():
    """
    Load all tools including MCP tools and Neo4j tools if configured.
    MultiServerMCPClient is stateless by default - each tool invocation
    creates a fresh session (per https://docs.langchain.com/oss/python/langchain/mcp)
    """
    tools = []

    # Check if Neo4j is configured and available
    neo4j_driver = get_neo4j_driver()
    if neo4j_driver is not None:
        # Use real Neo4j tools for JiraDocument schema
        tools.extend(
            [
                search_jira_text,
                search_jira_semantic,
                get_jira_details,
                find_experts_by_topic,
                find_experts_by_label,
                find_jiras_by_person,
                list_jira_labels,
            ]
        )
        print("[OK] Neo4j tools loaded:")
        print("   - search_jira_text: Keyword search on JIRAs")
        print("   - search_jira_semantic: Semantic/vector search")
        print("   - get_jira_details: Get full JIRA details")
        print("   - find_experts_by_topic: Find experts by topic keywords")
        print("   - find_experts_by_label: Find experts by JIRA labels")
        print("   - find_jiras_by_person: Find JIRAs by assignee/reporter name")
        print("   - list_jira_labels: List all available labels")
    else:
        # Fall back to mock tools
        print("[WARN] Neo4j not available")

    # Check if Atlassian MCP is configured
    jira_configured = bool(settings.jira_url) and bool(
        settings.jira_personal_token
        or (settings.jira_username and settings.jira_api_token)
    )

    if not jira_configured:
        print("[WARN] Atlassian MCP not configured - skipping MCP tools")
        return tools

    try:
        client = MultiServerMCPClient(MCP_SERVERS)
        mcp_tools = await client.get_tools()
        print(f"✅ Loaded {len(mcp_tools)} MCP tools from Atlassian")

        # Log tool names to verify descriptions are loaded
        tool_names = [getattr(tool, "name", "unknown") for tool in mcp_tools]
        print(f"   Available MCP tools: {', '.join(tool_names[:10])}")
        if len(tool_names) > 10:
            print(f"   ... and {len(tool_names) - 10} more")

        tools.extend(mcp_tools)
    except Exception as e:
        print(f"[WARN] Failed to load MCP tools: {e}")

    return tools


all_tools = asyncio.run(load_tools())


# ---------------------------------------------------------------------------
# LangGraph Graph API: Build the agent workflow with StateGraph
# ---------------------------------------------------------------------------


def get_model():
    """
    Initialize the LLM based on configured API key (OpenAI or Anthropic).
    """
    if settings.openai_api_key:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=settings.model,
            api_key=settings.openai_api_key,
            streaming=True,
        )
    elif settings.anthropic_api_key:
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=settings.model,
            api_key=settings.anthropic_api_key,
            streaming=True,
        )
    else:
        raise ValueError("No API key configured")



def trim_tool_response(content: str, max_chars: int = 10000) -> str:
    """
    Trim a tool response that's too large to prevent context overflow.
    
    Strategy:
    - Keep first portion (usually most relevant)
    - Keep last portion (often contains summary/conclusion)
    - Add truncation notice in the middle
    
    Args:
        content: The tool response content
        max_chars: Maximum characters to keep (default 10k chars ≈ 2.5k tokens)
    
    Returns:
        Trimmed content with truncation notice
    """
    if len(content) <= max_chars:
        return content
    
    # Calculate how much to keep from start and end
    keep_start = int(max_chars * 0.7)  # 70% from start
    keep_end = int(max_chars * 0.3)    # 30% from end
    
    start_content = content[:keep_start]
    end_content = content[-keep_end:]
    
    truncated_chars = len(content) - max_chars
    truncation_notice = f"\n\n... [TRUNCATED {truncated_chars:,} characters to prevent context overflow] ...\n\n"
    
    return start_content + truncation_notice + end_content




# Get the model and bind tools to it
model = get_model()
model_with_tools = model.bind_tools(all_tools)


# Define the agent node that calls the LLM  
async def agent_node(state: ExpertFinderState, config: RunnableConfig = None) -> dict:
    """
    The agent node that calls the LLM with the current messages and tools.
    The LLM decides whether to respond directly or call tools.
    
    Traced automatically by autolog as a span within the graph execution trace.
    """
    try:
        messages = state.get("messages", [])
        print(f"[AGENT_NODE] Processing {len(messages)} input messages")
        
        # Add system prompt if not already present
        # Use load_system_prompt() for lazy loading from MLflow registry
        if not messages or not isinstance(messages[0], SystemMessage):
            messages = [SystemMessage(content=load_system_prompt())] + list(messages)
        
        # Trim oversized tool responses in existing messages
        for msg in messages:
            if isinstance(msg, ToolMessage):
                if isinstance(msg.content, str) and len(msg.content) > 10000:
                    msg.content = trim_tool_response(msg.content)
            elif isinstance(msg, AIMessage):
                if isinstance(msg.content, str) and len(msg.content) > 50000:
                    msg.content = trim_tool_response(msg.content, max_chars=50000)

        # Get frontend tools from CopilotKit state and merge with backend tools
        copilotkit_state = state.get("copilotkit", {})
        frontend_actions = copilotkit_state.get("actions", [])
        
        # Create model with merged tools if frontend actions exist
        if frontend_actions:
            merged_tools = all_tools + frontend_actions
            model_to_use = model.bind_tools(merged_tools)
        else:
            model_to_use = model_with_tools
        
        # Call the LLM
        response = await model_to_use.ainvoke(messages)
        
        # Log message details for debugging
        print(f"[AGENT_NODE] LLM response: type={type(response).__name__}, has_id={hasattr(response, 'id')}, id={getattr(response, 'id', 'NO_ATTR')}")
        if hasattr(response, 'additional_kwargs'):
            print(f"[AGENT_NODE] additional_kwargs keys: {list(response.additional_kwargs.keys())}")
            if 'parentMessageId' in response.additional_kwargs:
                print(f"[AGENT_NODE] parentMessageId in additional_kwargs: {response.additional_kwargs['parentMessageId']}")
        
        # Ensure response has an ID
        if hasattr(response, 'id') and response.id is None:
            response.id = str(uuid.uuid4())
            print(f"[AGENT_NODE] Fixed null ID on response, set to {response.id}")
        
        # Check for parentMessageId as direct attribute
        if hasattr(response, 'parentMessageId'):
            print(f"[AGENT_NODE] Response has parentMessageId attribute: {response.parentMessageId}")
            if response.parentMessageId is None:
                print(f"[AGENT_NODE] WARNING: Response has null parentMessageId attribute - REMOVING")
                try:
                    del response.parentMessageId
                except:
                    pass
        
        # Fix parentMessageId if it's null in additional_kwargs
        if hasattr(response, 'additional_kwargs'):
            if 'parentMessageId' in response.additional_kwargs:
                if response.additional_kwargs['parentMessageId'] is None:
                    print(f"[AGENT_NODE] WARNING: Removing null parentMessageId from response additional_kwargs")
                    del response.additional_kwargs['parentMessageId']
        
        # Check serialized output
        try:
            if hasattr(response, 'dict'):
                serialized = response.dict()
                if 'parentMessageId' in serialized and serialized['parentMessageId'] is None:
                    print(f"[AGENT_NODE] CRITICAL: Serialized response has null parentMessageId!")
        except Exception as e:
            pass
        
        return {"messages": [response]}
    except Exception as e:
        # Capture error and add it to state for frontend display
        error_msg = f"Agent error: {type(e).__name__}: {str(e)}"
        print(f"[ERROR] {error_msg}")
        # print(f"[ERROR] Full traceback:", exc_info=True)
        
        # Create an error message that will be displayed to the user
        # Generate a proper ID to avoid null/None issues with CopilotKit's Zod validation
        error_response = AIMessage(
            content=f"⚠️ **An error occurred while processing your request:**\n\n```\n{error_msg}\n```",
            id=str(uuid.uuid4())  # Ensure id is a string, not None
        )
        
        print(f"[ERROR] Created error response: id={error_response.id}, type={type(error_response).__name__}")
        
        # Return error state - store error in state for frontend access
        return {
            "messages": [error_response],
            "error": error_msg
        }


# Define the conditional edge to determine next step
def should_continue(state: ExpertFinderState) -> Literal["tools", "feedback", END]:
    """
    Determines whether to continue to tools, feedback, or end the conversation.

    If the last message has tool calls, route to tools node.
    If the agent finished responding, route to feedback node for human-in-the-loop.
    Otherwise, end the conversation.
    """
    messages = state.get("messages", [])
    print(f"[ROUTING] should_continue called with {len(messages)} messages")
    
    if not messages:
        print("[ROUTING] No messages, returning END")
        return END

    last_message = messages[-1]
    print(f"[ROUTING] Last message type: {type(last_message).__name__}")
    
    # Check if the last message is an AI message with tool calls
    if isinstance(last_message, AIMessage):
        has_tool_calls = bool(last_message.tool_calls)
        print(f"[ROUTING] AIMessage - has_tool_calls: {has_tool_calls}")
        
        if has_tool_calls:
            print("[ROUTING] → Routing to 'tools'")
            return "tools"
        else:
            print("[ROUTING] → Routing to 'feedback'")
            return "feedback"
    
    print(f"[ROUTING] → Returning END (message type: {type(last_message).__name__})")
    return END


# Define the feedback collection node using interrupt()
async def feedback_node(state: ExpertFinderState, config: RunnableConfig = None) -> dict:
    """
    Feedback collection node that calls interrupt() to pause execution.
    
    The interrupt() call emits an on_interrupt event that CopilotKit can detect.
    When resumed, the feedback is provided and logged to MLflow.
    
    Traced automatically by autolog as a span within the graph execution trace.
    """
    from langgraph.types import interrupt
    
    # Extract thread_id for session tracking (used for MLflow trace scoring)
    thread_id = None
    if config:
        configurable = config.get("configurable", {})
        thread_id = configurable.get("thread_id") if configurable else None
    
    print("\n\n")
    print("=" * 80)
    print("[FEEDBACK] FEEDBACK NODE ENTERED!!!")
    print("=" * 80)
    print("\n")
    
    messages = state.get("messages", [])
    print(f"[FEEDBACK] State has {len(messages)} messages")
    
    # Find the last AI message (the response to rate)
    last_ai_message = None
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and not msg.tool_calls:
            last_ai_message = msg
            break
    
    if not last_ai_message:
        print("[FEEDBACK] No AI message to rate, skipping")
        return {}
    
    response_text = last_ai_message.content if isinstance(last_ai_message.content, str) else str(last_ai_message.content)
    
    # Get the active trace ID to include in the interrupt event
    trace_id = None
    if settings.mlflow_enabled:
        try:
            active_trace = mlflow.last_active_trace()
            if active_trace:
                trace_id = active_trace.info.request_id
        except Exception as e:
            print(f"[FEEDBACK] Could not get trace ID: {e}")
    
    print(f"[FEEDBACK] ===== CALLING INTERRUPT() =====")
    print(f"[FEEDBACK] Response to rate: {len(response_text)} chars")
    print(f"[FEEDBACK] Trace ID: {trace_id}")
    
    # Call interrupt() - this should pause and emit on_interrupt event
    # Include trace ID so frontend can log feedback via API
    feedback_data = interrupt(
        {
            "type": "feedback_request",
            "question": "Was this response helpful?",
            "options": ["yes", "no"],
            "response": response_text[:500],  # First 500 chars
            "traceId": trace_id,  # Include trace ID for frontend logging
        }
    )
    
    print(f"[FEEDBACK] ===== INTERRUPT RETURNED =====")
    print(f"[FEEDBACK] Feedback data: {feedback_data}")
    print(f"[FEEDBACK] Feedback type: {type(feedback_data)}")
    
    # Extract feedback from the resume data
    # Frontend sends JSON string: {"feedback": "yes"} or {"feedback": "no"}
    feedback = None
    if feedback_data:
        if isinstance(feedback_data, dict):
            feedback = feedback_data.get("feedback", "")
        elif isinstance(feedback_data, str):
            # Try parsing as JSON first
            try:
                import json
                parsed = json.loads(feedback_data)
                feedback = parsed.get("feedback", "")
            except:
                # Fallback to string matching
                feedback = "yes" if "yes" in feedback_data.lower() else "no"
    
    print(f"[FEEDBACK] Extracted feedback: {feedback}")
    
    if not feedback:
        print("[FEEDBACK] No feedback received")
        return {}
    
    # Score the trace with feedback
    score = 1 if feedback == "yes" else 0
    print(f"[FEEDBACK] Scoring trace: {feedback} (score: {score})")
    
    if settings.mlflow_enabled:
        try:
            # Get the active trace (should be the parent thread execution trace)
            active_trace_id = mlflow.get_last_active_trace_id()
            
            if active_trace_id is not None:
                trace_id = active_trace_id
                
                # Use the proper MLflow feedback API
                from mlflow.entities import AssessmentSource, AssessmentSourceType
                
                mlflow.log_feedback(
                    trace_id=trace_id,
                    name="user_satisfaction",
                    value=(feedback == "yes"),  # Boolean value
                    rationale=f"User indicated response was {'helpful' if feedback == 'yes' else 'not helpful'}",
                    source=AssessmentSource(
                        source_type=AssessmentSourceType.HUMAN,
                        source_id="agent_feedback_node"
                    )
                )
                
                print(f"[OK] Feedback logged for trace: {trace_id} (value: {feedback})")
            else:
                print("[WARN] No active trace to score")
        except Exception as e:
            print(f"[WARN] MLflow feedback logging failed: {e}")
    
    return {}


# Create the tool node using LangGraph's prebuilt ToolNode
# handle_tool_errors=True ensures that if a frontend tool is called
# (which isn't in our tools list), it won't crash - just returns an error message
_base_tool_node = ToolNode(all_tools, handle_tool_errors=True)


# Wrapper to fix null ID fields in tool responses and mark errors
async def tool_node(state: ExpertFinderState, config: RunnableConfig = None) -> dict:
    """
    Wrapper around the base tool node to fix None/null ID fields that cause
    Zod validation errors in the frontend, and mark tool errors explicitly.
    
    Traced automatically by autolog as a span within the graph execution trace.
    """
    print(f"[TOOL_NODE] Starting tool execution")
    
    # Call the base tool node
    result = await _base_tool_node.ainvoke(state)
    
    print(f"[TOOL_NODE] Tool execution complete, processing {len(result.get('messages', []))} messages")
    
    # Fix None/null id fields and mark errors in messages
    if "messages" in result:
        for i, msg in enumerate(result["messages"]):
            print(f"[TOOL_NODE] Message {i}: type={type(msg).__name__}, has_id={hasattr(msg, 'id')}, id={getattr(msg, 'id', 'NO_ATTR')}")
            
            # Dump full message structure for debugging
            if hasattr(msg, '__dict__'):
                print(f"[TOOL_NODE] Message {i} full dict keys: {list(msg.__dict__.keys())}")
                # Check ALL message attributes for null values
                for attr, value in msg.__dict__.items():
                    if value is None:
                        print(f"[TOOL_NODE] WARNING: Message {i}.{attr} = None")
            
            # Fix None/null id field that causes Zod validation errors
            if hasattr(msg, 'id') and msg.id is None:
                new_id = str(uuid.uuid4())
                msg.id = new_id
                print(f"[TOOL_NODE] Fixed null ID on message {i}, set to {new_id}")
            
            # Check for parent_id / parentMessageId as direct attributes
            # Note: We can't safely delete these if Zod schema requires them
            # So we try to set them to a valid value instead
            if hasattr(msg, 'parent_id'):
                if msg.parent_id is None:
                    print(f"[TOOL_NODE] WARNING: Message {i} has null parent_id")
                    # Try to set to empty string or find the previous message's ID
                    try:
                        del msg.parent_id
                    except:
                        pass
            
            if hasattr(msg, 'parentMessageId'):
                if msg.parentMessageId is None:
                    print(f"[TOOL_NODE] WARNING: Message {i} has null parentMessageId")
                    # Try to delete it
                    try:
                        del msg.parentMessageId
                    except:
                        pass
            
            # Check additional_kwargs for parentMessageId
            if hasattr(msg, 'additional_kwargs'):
                print(f"[TOOL_NODE] Message {i} additional_kwargs keys: {list(msg.additional_kwargs.keys())}")
                if 'parentMessageId' in msg.additional_kwargs:
                    print(f"[TOOL_NODE] Message {i} parentMessageId value: {msg.additional_kwargs['parentMessageId']}")
                    if msg.additional_kwargs['parentMessageId'] is None:
                        print(f"[TOOL_NODE] WARNING: Message {i} has null parentMessageId in additional_kwargs - REMOVING")
                        del msg.additional_kwargs['parentMessageId']
            
            # Try to serialize the message to see what CopilotKit will receive
            try:
                if hasattr(msg, 'dict'):
                    serialized = msg.dict()
                    print(f"[TOOL_NODE] Message {i} serialized keys: {list(serialized.keys())}")
                    if 'parentMessageId' in serialized:
                        print(f"[TOOL_NODE] Message {i} serialized parentMessageId: {serialized['parentMessageId']}")
                        # This is the problem - if it's in the serialized output, we need to fix the source
            except Exception as e:
                print(f"[TOOL_NODE] Could not serialize message {i}: {e}")
            
            # Mark tool errors explicitly in ToolMessage metadata
            # LangGraph's handle_tool_errors returns errors as ToolMessages with error text
            if hasattr(msg, 'content') and isinstance(msg.content, str):
                is_error = (
                    "Error:" in msg.content or
                    "HTTPError:" in msg.content or
                    "HTTP error" in msg.content or
                    "Traceback" in msg.content or
                    "does not exist for the field" in msg.content or
                    msg.content.lower().startswith("error")
                )
                
                if is_error:
                    print(f"[TOOL_NODE] Message {i} contains error")
                
                # Add error flag to additional_kwargs for frontend access
                if is_error and hasattr(msg, 'additional_kwargs'):
                    msg.additional_kwargs['error'] = True
                elif is_error:
                    # Create additional_kwargs if it doesn't exist
                    msg.additional_kwargs = {'error': True}
    
    print(f"[TOOL_NODE] Returning result with {len(result.get('messages', []))} messages")
    return result


# Build the StateGraph workflow
workflow = StateGraph(ExpertFinderState)

# Add nodes
workflow.add_node("agent", agent_node)
workflow.add_node("tools", tool_node)
workflow.add_node("feedback", feedback_node)

# Add edges
workflow.add_edge(START, "agent")  # Start with the agent
workflow.add_conditional_edges(
    "agent",
    should_continue,
    {
        "tools": "tools",
        "feedback": "feedback",
        END: END,
    },
)
workflow.add_edge("tools", "agent")  # After tools, go back to agent
workflow.add_edge("feedback", END)  # After feedback, end

# Compile the graph WITH interrupt_before on the feedback node
# This tells LangGraph to pause before executing the feedback node and emit the interrupt event
# CopilotKit will detect this and trigger the useLangGraphInterrupt hook in the frontend
graph = workflow.compile()

# autolog() automatically traces the entire graph execution as one trace,
# with all node executions captured as spans within that trace
