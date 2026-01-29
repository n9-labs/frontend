"""
Expert Finder Agent - Finds the right people to talk to about features
Uses RAG search and graph traversal to identify experts from JIRA data
Integrates with Atlassian MCP server for real Jira/Confluence access
"""

import os
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
def search_jira_vectors(query: str) -> str:
    """
    Perform semantic search on JIRA descriptions to find relevant issues.
    This simulates a vector database search (like Qdrant or Chroma) that would
    find JIRAs matching the query based on semantic similarity.

    Args:
        query: The search query (e.g., "experiment tracking dashboard")

    Returns:
        Summary of JIRA issues that match the query semantically
    """
    # TODO: Replace with actual vector DB call (Qdrant, Chroma, etc.)
    # For now, simple keyword matching as mock
    query_lower = query.lower()
    results = []

    for jira in MOCK_JIRAS.values():
        # Simple relevance scoring based on keywords
        summary_lower = jira.summary.lower()
        desc_lower = (jira.description or "").lower()

        if any(
            word in summary_lower or word in desc_lower for word in query_lower.split()
        ):
            results.append(jira)

    # Return top 3-5 most relevant as formatted string
    top_results = results[:5]
    if not top_results:
        return "No matching JIRAs found"

    output = f"Found {len(top_results)} relevant JIRAs:\n\n"
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


@tool
def traverse_jira_graph(jira_ids: List[str], max_depth: int = 2) -> str:
    """
    Traverse the JIRA relationship graph starting from the given JIRAs.
    Follows connections like: relates_to, depends_on, blocks, child_of, linked_issue.
    This simulates a graph database traversal (like Neo4j) that would walk through
    connected JIRAs to build a comprehensive picture.

    Args:
        jira_ids: List of JIRA IDs to start traversal from
        max_depth: Maximum depth to traverse (default 2)

    Returns:
        Summary of connected JIRAs
    """
    # TODO: Replace with actual graph DB traversal (Neo4j, etc.)
    # For now, return related JIRAs based on component overlap

    results = []
    components_seen = set()

    # Add starting JIRAs
    for jira_id in jira_ids:
        if jira_id in MOCK_JIRAS:
            jira = MOCK_JIRAS[jira_id]
            results.append(jira)
            components_seen.update(jira.components)

    # Find related JIRAs by component overlap
    for jira in MOCK_JIRAS.values():
        if jira.id not in jira_ids:
            # Check if shares components
            if any(comp in components_seen for comp in jira.components):
                results.append(jira)

    if not results:
        return "No connected JIRAs found"

    output = f"Graph traversal found {len(results)} connected JIRAs:\n\n"
    for jira in results:
        output += f"**{jira.id}** ({jira.type}): {jira.summary}\n"
        if jira.assignee:
            output += f"  Assignee: {jira.assignee.name} ({jira.assignee.email})"
            if jira.assignee.slack_id:
                output += f" (Slack: {jira.assignee.slack_id})"
            output += "\n"
        if jira.reporter:
            output += f"  Reporter: {jira.reporter.name} ({jira.reporter.email})"
            if jira.reporter.slack_id:
                output += f" (Slack: {jira.reporter.slack_id})"
            output += "\n"
        if jira.team:
            output += f"  Team: {jira.team}\n"
        if jira.components:
            output += f"  Components: {', '.join(jira.components)}\n"
        output += f"  Status: {jira.status}\n\n"

    return output


# System prompt with role inference guidelines
SYSTEM_PROMPT = """You are an expert finder for OpenShift AI. Your job is to help users 
find the right people to talk to about features, products, or technical questions.

⚠️ **IMPORTANT**: Always READ the tool descriptions carefully before using them! 
The MCP tools include detailed examples and parameter explanations - follow them exactly.

## Available Tools

You have access to two types of tools:

### Local Mock Tools (always available)
- search_jira_vectors: Semantic search on mock JIRA data
- traverse_jira_graph: Graph traversal on mock JIRA relationships

### Atlassian MCP Tools (when configured)
**IMPORTANT**: The MCP tools come with detailed descriptions and examples. READ them carefully!



## Your Workflow

1. **Understand the Query**: When a user asks "Who do I talk to about [feature/topic]?", 
   extract the key concepts from their question.

2. **Search Jira**: 
   - **READ the tool description first!** The jira_search tool has examples you should follow
   - Start simple: Try `search(project="RHOAIENG", text="<keywords>")`  
   - If that fails: Fall back to `search_jira_vectors("<keywords>")` (always works)
   - Only use complex JQL if you've READ the tool's examples and are following them exactly

3. **Expand via Graph Traversal**: Take the JIRA IDs from step 2 and use 
   traverse_jira_graph to find connected issues. This gives you a comprehensive view 
   of everyone working in that feature area.

4. **Identify Experts**: Analyze all the JIRAs to identify the key people involved.
   For each person, determine their likely role and team.

## Role Inference Guidelines

Use these heuristics to infer roles from JIRA types and metadata:

- **Epic JIRAs**: Usually have a **Feature Lead** or **Product Manager** assigned
  - Epics represent large features that need technical leadership
  - Product strategy is often tracked in Epics
  - If someone is assigned to multiple Epics, they're likely a PM or Tech Lead
  
- **Story JIRAs**: Usually assigned to **Developers**
  - Implementation work is done by developers
  - Stories are the main unit of development work
  
- **Bug JIRAs**: Usually assigned to **Developers** (the one fixing it)
  - The **Reporter** might be a QE engineer or Product Manager
  
- **Task JIRAs**: Could be assigned to various roles (Dev, QE, PM, etc.)
  - Context matters - look at the description and related issues
  
- **Multiple related issues in the same area**: Likely indicates subject matter expertise
  - Someone working on many dashboard-related tickets is the dashboard expert

## Team Inference

Use component tags and JIRA metadata to guess team affiliations

## Confidence Levels

Assign confidence based on clarity of evidence:

- **High**: Clear JIRA type match (e.g., RFE assigned to PM), multiple related JIRAs
- **Medium**: Reasonable inference but limited context
- **Low**: Unclear or conflicting signals

## Output Format

For each expert you identify, provide:
- Their name and contact info
- Inferred role with confidence level
- Team (if identifiable)
- Clear reasoning explaining your inference
- List of JIRA IDs supporting your conclusion

Always be helpful and explain your reasoning clearly. If you're unsure, say so and 
explain why the evidence is ambiguous."""


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
    Load all tools including MCP tools if configured.
    MultiServerMCPClient is stateless by default - each tool invocation
    creates a fresh session (per https://docs.langchain.com/oss/python/langchain/mcp)
    """
    # Start with local mock tools
    # tools = [search_jira_vectors, traverse_jira_graph]
    tools = []

    # Check if Atlassian MCP is configured
    jira_configured = bool(settings.jira_url) and bool(
        settings.jira_personal_token
        or (settings.jira_username and settings.jira_api_token)
    )

    if not jira_configured:
        print("⚠️  Atlassian MCP not configured - using mock tools only")
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
        print(f"⚠️  Failed to load MCP tools: {e}")

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
