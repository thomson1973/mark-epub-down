# Agent Skills

`mark-epub-down` includes repo-versioned agent skill definitions for EPUB-to-Markdown tasks aimed at LLM knowledge bases, wikis, and ingestion workflows.

These skill definitions are for agent-assisted use of the project. They do not change the published npm package interface.

## Overview

This repository currently includes:

- a project-scoped `Claude Code` skill
- a project-scoped `Claude Code` subagent
- a repo-versioned `Codex` skill source

All of them are designed around the same job:

- convert one EPUB into one Markdown source document
- keep output suitable for LLM knowledge bases, wikis, and ingestion workflows
- preserve semantics and source order conservatively
- surface warnings or degradation instead of guessing

## What This Skill Is For

Use the skill when the task is to:

- convert a single EPUB into a single Markdown source document
- run `epub2llm`
- use the `mark-epub-down` Node.js package
- inspect warnings or conservative degradation around TOC targets, internal links, or dropped non-text media

The skill is intentionally aligned with the same public boundaries as the converter itself:

- preserve semantics, source order, and safe target rewriting conservatively
- do not optimize for visual EPUB reproduction
- do not rely on aggressive guessed structure repair
- do not assume chapter-split output in the current baseline

## Claude Code

This repository includes two Claude Code integration forms:

- a project-scoped skill at `.claude/skills/mark-epub-down/SKILL.md`
- a project-scoped subagent at `.claude/agents/mark-epub-down.md`

Use the Claude Code skill when you want a slash-invocable workflow such as `/mark-epub-down`.

Use the Claude Code subagent when you want a specialized agent visible in `/agents`.

Anthropic documents Claude Code skills separately from subagents. Sources: [Use skills to extend Claude](https://code.claude.com/docs/zh-TW/skills), [Claude Code settings](https://docs.anthropic.com/en/docs/claude-code/settings), [Claude Code subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents)

## Codex

This repository includes a Codex skill source at:

```text
skills/mark-epub-down/
```

The skill source contains:

- `SKILL.md` for trigger and workflow guidance
- `agents/openai.yaml` for Codex UI metadata
- `references/project-workflow.md` for project-specific execution and validation guidance

The repository treats `skills/mark-epub-down/` as the versioned source of truth for this skill.

## Install From Repo Source

### Claude Code

If you want the Claude Code skill only inside this repository, keep the project-scoped skill directory where it is:

```text
.claude/skills/mark-epub-down/SKILL.md
```

If you want a user-level Claude Code skill for other repositories, copy the skill directory into:

```text
~/.claude/skills/
```

Example:

```bash
mkdir -p ~/.claude/skills
cp -R /absolute/path/to/mark-epub-down/.claude/skills/mark-epub-down ~/.claude/skills/
```

If you also want the subagent version in `/agents`, keep or copy:

```text
.claude/agents/mark-epub-down.md
```

or copy it into:

```text
~/.claude/agents/
```

Example:

```bash
mkdir -p ~/.claude/agents
cp /absolute/path/to/mark-epub-down/.claude/agents/mark-epub-down.md ~/.claude/agents/
```

### Codex

For filesystem-managed Codex skills, a common local install location is:

```text
~/.codex/skills/
```

If your setup uses `CODEX_HOME`, use:

```text
$CODEX_HOME/skills/
```

You can install the repo skill by copying or symlinking `skills/mark-epub-down/` into that directory.

Example using copy:

```bash
mkdir -p ~/.codex/skills
cp -R /absolute/path/to/mark-epub-down/skills/mark-epub-down ~/.codex/skills/
```

Example using symlink:

```bash
mkdir -p ~/.codex/skills
ln -s /absolute/path/to/mark-epub-down/skills/mark-epub-down ~/.codex/skills/mark-epub-down
```

Use a symlink if you want the installed skill to follow this repository as you edit it. Use a copy if you want a standalone snapshot.

## Update Or Sync From Repo Source

### Claude Code

If you use the project-scoped skill or subagent inside this repository, updating the repository updates those definitions automatically.

If you copied the skill directory into `~/.claude/skills/`, repeat the copy step after you update the repository version you want to use.

If you copied the subagent file into `~/.claude/agents/`, repeat that copy step separately after updates.

### Codex

If you installed the skill with a symlink, updates in this repository are reflected through that symlink.

If you installed the skill by copying the directory, update by replacing the installed copy with a fresh copy from:

```text
skills/mark-epub-down/
```

## Usage Intent

Whether invoked from Claude Code or Codex, the skill is meant to help the agent choose an appropriate execution path:

- installed `epub2llm`
- `npx --package mark-epub-down epub2llm`
- local repository build plus `node dist/cli.js`
- Node API via `convertEpub()`

The expected outcome is one Markdown file per EPUB plus a clear summary of warnings or degradation when safe rewriting is not possible.

## Limitations

This document describes the repository's skill source and common local installation patterns.

Skill discovery details can vary by agent runtime and local environment. If a runtime does not detect the installed skill or subagent as expected, verify the install location and the runtime's current loading behavior in your environment before relying on it in regular workflows.
