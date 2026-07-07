# 🧰 AI Toolbox

Personal playground and toolbox for AI-assisted development: rules, skills, prompts, and knowledge I reuse across all my projects and **all AI tools** (Claude Code, Codex, Cursor, ...). Think of it as *dotfiles for AI*.

One repo, tool-agnostic, versioned like code. When a rule misfires, fix it and commit.

## Structure

```
ai-toolbox/
├── rules/
│   └── AGENTS.md   # Canonical global rules — single source of truth
├── skills/         # Reusable skill folders (SKILL.md + optional assets)
│   └── <skill>/
│       └── SKILL.md
├── prompts/        # Prompt templates I reuse (SEO briefs, PR reviews, ...)
├── knowledge/      # Stable reference docs (stack decisions, deployment gotchas)
└── setup.sh        # Fans out rules into per-tool config for the current repo
```

### What goes where

| Folder | Purpose | Examples |
|---|---|---|
| `rules/` | **Global** rules that always apply. Loaded into every context, so keep them short. | TS conventions, "prefer explicit over clever", formatting preferences |
| `skills/` | **Contextual** capabilities, only loaded when relevant. | Astro micro-site scaffold, Coolify deployment, SEO page checklist |
| `prompts/` | Templates for recurring one-off tasks. | Keyword research brief, code review prompt |
| `knowledge/` | Reference docs written once, reused everywhere. | Hono/Drizzle/Better Auth boilerplate decisions, Coolify quirks, Astro static-output setup |

**Rule of thumb:** if it should apply to *every* conversation → `rules/`. If it's only useful for a specific kind of task → `skills/`. If it's facts, not behavior → `knowledge/`.

## Design principle: one source, many formats

Every tool wants its own file name for the same thing:

| Tool | Global rules | Per-project rules | Skills |
|---|---|---|---|
| **AGENTS.md standard** (Codex, and a growing list) | — | `AGENTS.md` | — |
| **Claude Code** | `~/.claude/CLAUDE.md` | `CLAUDE.md` | `~/.claude/skills/` or `.claude/skills/` |
| **Cursor** | user settings | `.cursor/rules/` or `.cursorrules` | — |

The content is 95% identical, so: **write once in `rules/AGENTS.md`, symlink everything else to it.** Never edit the tool-specific files directly.

## Setup (user-level, once per machine)

```bash
git clone git@github.com:<you>/ai-toolbox.git ~/ai-toolbox

# Claude Code — global rules + skills
mkdir -p ~/.claude
ln -s ~/ai-toolbox/rules/AGENTS.md ~/.claude/CLAUDE.md
ln -s ~/ai-toolbox/skills ~/.claude/skills

# Codex — global guidance
mkdir -p ~/.codex
ln -s ~/ai-toolbox/rules/AGENTS.md ~/.codex/AGENTS.md
```

Updating everything everywhere:

```bash
cd ~/ai-toolbox && git pull
```

> **Note:** back up any existing config files before symlinking.

## Setup (per-repo)

For rules that should live *with* a project (and travel with it to CI, teammates, or cloud agents), run the fan-out script from inside the repo:

```bash
~/ai-toolbox/setup.sh
```

Which does roughly:

```bash
# AGENTS.md is the canonical per-repo file
touch AGENTS.md                  # project-specific rules go here
ln -s AGENTS.md CLAUDE.md        # Claude Code reads it too
```

Project `AGENTS.md` = project-specific stuff only (stack, commands, structure). Global preferences stay in the toolbox — don't duplicate.

> **Tip for teams:** commit `AGENTS.md`, and decide as a team whether tool-specific symlinks get committed or gitignored.

## Adding new content

1. **Start from real friction.** Don't design taxonomy up front — when you notice yourself re-explaining something to the AI for the third time, that's a rule/skill/knowledge doc waiting to be written.
2. **Keep global rules minimal.** Everything in `rules/AGENTS.md` costs context window in every conversation. If it's not universally useful, make it a skill instead.
3. **Write tool-agnostic.** Rules should make sense to any agent. Avoid tool-specific syntax in the canonical file; if a tool needs special directives, put them in a small tool-specific section or file.
4. **Skills format:** one folder per skill with a `SKILL.md` containing a clear description of *when* it should trigger and *what* it does. Add supporting assets (templates, examples) in the same folder. Claude Code loads these natively; for other tools, reference the skill file explicitly in your prompt.
5. **Commit like code.** Small commits, clear messages. Rules evolve — history tells you why.

## Conventions

- Everything in Markdown unless there's a reason not to
- English for rules/skills (better model performance), any language for personal notes in `knowledge/`
- No secrets, ever — this repo may end up in many contexts
