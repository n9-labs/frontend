"""
Expert Finder Agent - Finds the right people to talk to about features
Uses RAG search and graph traversal to identify experts from JIRA data
Integrates with Atlassian MCP server for real Jira/Confluence access
"""

import asyncio
from typing import List, Optional
from pydantic import BaseModel, Field, model_validator
from pydantic_settings import BaseSettings  # type: ignore
from langchain.tools import tool
from langchain.agents import create_agent
from langchain.agents.middleware.types import AgentState as LangChainAgentState
from langchain_core.messages import HumanMessage
from copilotkit import CopilotKitMiddleware
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.sessions import Connection
from typing_extensions import NotRequired


class Settings(BaseSettings):
    """Centralized env-driven configuration for local/dev deploys."""

    # Load from agent/.env if present, plus real env vars.
    model_config = {"env_file": ".env", "extra": "ignore"}

    # API key (assume good intent):
    # - exactly one of OPENAI_API_KEY or ANTHROPIC_API_KEY must be set
    openai_api_key: str = Field(default="", validation_alias="OPENAI_API_KEY")
    anthropic_api_key: str = Field(default="", validation_alias="ANTHROPIC_API_KEY")
    api_key: str = Field(default="")

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


class ExpertFinderState(LangChainAgentState):
    """
    LangGraph agent state *schema*.

    `create_agent(..., state_schema=...)` uses this for typing and schema-merging
    (it is not something you instantiate like a Pydantic model).
    """

    # Provided by CopilotKitMiddleware at runtime (and by `make_initial_state` for local runs)
    copilotkit: NotRequired[dict]

    query: NotRequired[str]
    rag_results: NotRequired[List[Jira]]
    graph_results: NotRequired[List[Jira]]
    experts: NotRequired[List[Expert]]
    search_phase: NotRequired[str]


def make_initial_state(user_message: str) -> ExpertFinderState:
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


# Mock data for development - represents JIRAs from OpenShift AI
MOCK_JIRAS = {
    "RHOAIENG-4521": Jira(
        id="RHOAIENG-4521",
        type="EPIC",
        summary="Experiment Tracking Dashboard",
        description="Build a comprehensive experiment tracking dashboard for MLflow integration",
        assignee=Person(
            name="Sarah Chen", email="schen@redhat.com", slack_id="U123ABC"
        ),
        reporter=Person(name="Rachel Kim", email="rkim@redhat.com", slack_id="U789XYZ"),
        components=["dashboard", "mlflow", "frontend"],
        team="ML/AI",
        status="In Progress",
    ),
    "RHOAIENG-4102": Jira(
        id="RHOAIENG-4102",
        type="RFE",
        summary="MLflow experiment comparison feature",
        description="Allow users to compare multiple experiments side-by-side",
        assignee=Person(
            name="James Morrison", email="jmorrison@redhat.com", slack_id="U456DEF"
        ),
        reporter=Person(name="Alice Patel", email="apatel@redhat.com"),
        components=["mlflow", "ui"],
        status="Approved",
    ),
    "RHOAIENG-3845": Jira(
        id="RHOAIENG-3845",
        type="STORY",
        summary="Add distributed training support for PyTorch",
        description="Implement distributed training capabilities using PyTorch DDP with Kubeflow",
        assignee=Person(name="David Kumar", email="dkumar@redhat.com"),
        components=["training", "pytorch", "kubeflow"],
        team="Platform",
        status="In Progress",
    ),
    "RHOAIENG-4522": Jira(
        id="RHOAIENG-4522",
        type="STORY",
        summary="Implement experiment metrics visualization",
        description="Create interactive charts for experiment metrics tracking",
        assignee=Person(
            name="Mike Johnson", email="mjohnson@redhat.com", slack_id="U234GHI"
        ),
        components=["frontend", "dashboard", "visualization"],
        team="Frontend",
        status="In Review",
    ),
    "RHOAIENG-4089": Jira(
        id="RHOAIENG-4089",
        type="EPIC",
        summary="Q3 Experiment Tracking Strategy",
        description="Define product strategy for experiment tracking features",
        assignee=Person(name="Rachel Kim", email="rkim@redhat.com", slack_id="U789XYZ"),
        components=["strategy", "mlflow"],
        status="Closed",
    ),
    "RHOAIENG-3901": Jira(
        id="RHOAIENG-3901",
        type="EPIC",
        summary="Kubeflow Distributed Training Integration",
        description="Deep integration of Kubeflow for distributed training workloads",
        assignee=Person(name="Lisa Zhang", email="lzhang@redhat.com"),
        components=["kubeflow", "training", "gpu"],
        team="Platform",
        status="In Progress",
    ),
    "RHOAIENG-3846": Jira(
        id="RHOAIENG-3846",
        type="BUG",
        summary="KubeRay operator fails to schedule ray workers",
        description="KubeRay operator intermittently fails to schedule workers",
        assignee=Person(name="Alex Rodriguez", email="arodriguez@redhat.com"),
        reporter=Person(name="David Kumar", email="dkumar@redhat.com"),
        components=["kuberay", "scheduling"],
        team="Platform",
        status="In Progress",
    ),
    "RHOAIENG-3847": Jira(
        id="RHOAIENG-3847",
        type="STORY",
        summary="Add Ray cluster autoscaling support",
        description="Implement autoscaling capabilities for Ray clusters",
        assignee=Person(name="Alex Rodriguez", email="arodriguez@redhat.com"),
        components=["kuberay", "autoscaling"],
        team="Platform",
        status="In Review",
    ),
    "RHOAIENG-4103": Jira(
        id="RHOAIENG-4103",
        type="STORY",
        summary="Create experiment tagging and search system",
        description="Build tagging system for experiments with advanced search",
        assignee=Person(
            name="Sarah Chen", email="schen@redhat.com", slack_id="U123ABC"
        ),
        components=["mlflow", "search", "backend"],
        team="ML/AI",
        status="In Progress",
    ),
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


# Keep mock tools as fallback when Neo4j is not available
@tool
def search_jira_vectors(query: str) -> str:
    """
    [MOCK/FALLBACK] Perform semantic search on JIRA descriptions to find relevant issues.
    This uses mock data when Neo4j is not available.

    Args:
        query: The search query (e.g., "experiment tracking dashboard")

    Returns:
        Summary of JIRA issues that match the query semantically
    """
    query_lower = query.lower()
    results = []

    for jira in MOCK_JIRAS.values():
        summary_lower = jira.summary.lower()
        desc_lower = (jira.description or "").lower()

        if any(
            word in summary_lower or word in desc_lower for word in query_lower.split()
        ):
            results.append(jira)

    top_results = results[:5]
    if not top_results:
        return "No matching JIRAs found (using mock data)"

    output = f"Found {len(top_results)} relevant JIRAs (mock data):\n\n"
    for jira in top_results:
        output += f"**{jira.id}** ({jira.type}): {jira.summary}\n"
        if jira.assignee:
            output += f"  Assignee: {jira.assignee.name} ({jira.assignee.email})\n"
        if jira.reporter:
            output += f"  Reporter: {jira.reporter.name} ({jira.reporter.email})\n"
        if jira.team:
            output += f"  Team: {jira.team}\n"
        if jira.components:
            output += f"  Components: {', '.join(jira.components)}\n"
        output += f"  Status: {jira.status}\n\n"

    return output


# System prompt with role inference guidelines
SYSTEM_PROMPT = """You are an expert finder for Red Hat AI. Your job is to help users 
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

4. **Search for Context**: Use `search_jira_text` to find relevant JIRAs and understand
   what work is being done. Then use `get_jira_details` for full descriptions.

5. **Synthesize Results**: Combine findings to recommend the best contacts.

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
5. If you have ANY relevant experts, provide your answer - do not keep searching for "better" results"""


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
                list_jira_labels,
            ]
        )
        print("[OK] Neo4j tools loaded:")
        print("   - search_jira_text: Keyword search on JIRAs")
        print("   - search_jira_semantic: Semantic/vector search")
        print("   - get_jira_details: Get full JIRA details")
        print("   - find_experts_by_topic: Find experts by topic keywords")
        print("   - find_experts_by_label: Find experts by JIRA labels")
        print("   - list_jira_labels: List all available labels")
    else:
        # Fall back to mock tools
        tools.extend([search_jira_vectors])
        print("[WARN] Neo4j not available - using mock tools")

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

agent = create_agent(
    model=settings.model,
    tools=all_tools,
    middleware=[CopilotKitMiddleware()],
    state_schema=ExpertFinderState,
    system_prompt=SYSTEM_PROMPT,
)

graph = agent
