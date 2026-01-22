# Claude Stack

A Graphite-like CLI for managing stacks of Claude Code plans with dependency relationships.

## What it does

Claude Stack (`cc`) helps you organize and execute multiple Claude Code plans in the correct order based on their dependencies. Think of it like Graphite for git branches, but for Claude plans.

- **Visualize** plan dependencies as trees
- **Execute** plans in topological order via `claude -p`
- **Track** execution status across runs

## Installation

```bash
npm install -g claude-stack
```

## Setup

```bash
# Initialize config directory (~/.claude-stack/)
cc init
```

## Commands

| Command | Description |
|---------|-------------|
| `cc init` | Initialize configuration |
| `cc create <name>` | Create a stack (interactive by default) |
| `cc ls [stack]` | List stacks or visualize a specific stack |
| `cc status [stack]` | Show execution status |
| `cc run <stack>` | Execute plans in dependency order |

## Usage

### Create a stack

```bash
# Interactive mode (default) - use Space to select, Enter to confirm
cc create my-stack

# From specific plans
cc create my-stack -p fix-auth-bug -p add-login-feature

# From a plan and all its references
cc create my-stack --from-plan fix-auth-bug

# Without auto-resolving transitive dependencies
cc create my-stack -p some-plan --no-deps
```

### View stacks

```bash
# List all stacks
cc ls

# Visualize a stack as a tree
cc ls my-stack
```

Output:
```
Stack: my-stack

◯┬─fix-auth-bug
│ └─◯── add-login-feature

Legend:
  ◯ pending  ◉ running  ● completed  ✗ failed  ○ skipped
```

### Execute plans

```bash
# Preview execution order
cc run my-stack --dry-run

# Execute all plans
cc run my-stack

# Reset status and re-run
cc run my-stack --reset
```

## How Plans Work

Plans are markdown files in `~/.claude/plans/` with YAML frontmatter:

```markdown
---
references:
  - "[[other-plan-name]]"
  - "[[another-plan]]"
---
# Fix: Authentication Bug

## Problem
...
```

- **Plan ID** = filename without `.md`
- **Dependencies** = parsed from `references` field (wiki-link format)
- **Type** = extracted from H1 title prefix (`Fix:`, `Plan:`, `Feature:`, etc.)

## Storage

```
~/.claude-stack/
├── config.json           # Global settings
├── stacks/
│   └── my-stack.json     # Stack definitions
└── status/
    └── my-stack.json     # Execution status
```

## License

MIT
