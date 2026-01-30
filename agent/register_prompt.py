#!/usr/bin/env python3
"""
Register the Expert Finder system prompt in MLflow Prompt Registry.

This script registers or updates the system prompt with version control,
allowing you to iterate on the prompt without modifying application code.

Usage:
    # Register initial prompt
    python register_prompt.py

    # Update with a commit message
    python register_prompt.py --commit "Improved role inference guidelines"
    
    # Set an alias (e.g., for production deployment)
    python register_prompt.py --alias production
    
    # Register from a custom file
    python register_prompt.py --file custom_prompt.txt

Environment Variables:
    MLFLOW_TRACKING_URI: MLflow server URL (default: http://localhost:5000)
    MLFLOW_PROMPT_NAME: Name of the prompt (default: expert-finder-system-prompt)
"""

import argparse
import os
import sys
from pathlib import Path

import mlflow


# Default system prompt - kept in sync with main.py
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
5. If you have ANY relevant experts, provide your answer - do not keep searching for "better" results"""


def main():
    parser = argparse.ArgumentParser(
        description="Register the Expert Finder system prompt in MLflow Prompt Registry"
    )
    parser.add_argument(
        "--commit", "-c",
        default="Initial system prompt registration",
        help="Commit message for this prompt version"
    )
    parser.add_argument(
        "--alias", "-a",
        default=None,
        help="Set an alias for this version (e.g., 'production', 'staging')"
    )
    parser.add_argument(
        "--file", "-f",
        default=None,
        help="Load prompt from a file instead of using the default"
    )
    parser.add_argument(
        "--tracking-uri",
        default=os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5001"),
        help="MLflow tracking server URI (note: macOS uses port 5000 for AirPlay)"
    )
    parser.add_argument(
        "--prompt-name",
        default=os.getenv("MLFLOW_PROMPT_NAME", "expert-finder-system-prompt"),
        help="Name for the prompt in the registry"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the prompt without registering"
    )
    
    args = parser.parse_args()
    
    # Load prompt content
    if args.file:
        prompt_path = Path(args.file)
        if not prompt_path.exists():
            print(f"Error: File not found: {args.file}", file=sys.stderr)
            sys.exit(1)
        prompt_content = prompt_path.read_text()
        print(f"Loaded prompt from: {args.file}")
    else:
        prompt_content = DEFAULT_SYSTEM_PROMPT
        print("Using default system prompt")
    
    print(f"\nPrompt length: {len(prompt_content)} characters")
    
    if args.dry_run:
        print("\n--- Prompt Content (dry run) ---")
        print(prompt_content[:500] + "..." if len(prompt_content) > 500 else prompt_content)
        print("--- End Preview ---")
        return
    
    # Configure MLflow
    print(f"\nConnecting to MLflow at: {args.tracking_uri}")
    mlflow.set_tracking_uri(args.tracking_uri)
    
    try:
        # Register the prompt
        prompt = mlflow.genai.register_prompt(
            name=args.prompt_name,
            template=prompt_content,
            commit_message=args.commit,
            tags={
                "agent": "expert-finder",
                "type": "system",
                "model": "claude-sonnet-4-5",
            }
        )
        
        print(f"\n✅ Prompt registered successfully!")
        print(f"   Name: {args.prompt_name}")
        print(f"   Version: {prompt.version}")
        print(f"   Commit: {args.commit}")
        
        # Set alias if requested
        if args.alias:
            try:
                mlflow.genai.set_prompt_alias(
                    name=args.prompt_name,
                    alias=args.alias,
                    version=prompt.version,
                )
                print(f"   Alias: {args.alias} -> v{prompt.version}")
            except Exception as e:
                print(f"\n⚠️  Could not set alias: {e}")
        
        print(f"\nView in MLflow UI: {args.tracking_uri}/#/prompts/{args.prompt_name}")
        
    except Exception as e:
        print(f"\n❌ Failed to register prompt: {e}", file=sys.stderr)
        print("\nMake sure MLflow server is running:")
        print("  mlflow server --host 0.0.0.0 --port 5000")
        sys.exit(1)


if __name__ == "__main__":
    main()
