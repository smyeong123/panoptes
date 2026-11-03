# Security Policy

## Supported versions

Panoptes has no releases yet. Security fixes go to the latest `main` branch only.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the problem, how to reproduce it, and what it could expose.

This is a side project maintained on a best-effort basis. I'll aim to acknowledge reports within a week and will credit you in the fix unless you'd rather stay anonymous.

## What Panoptes touches

It helps to know Panoptes's threat model when judging whether something is a vulnerability.

- **It reads local logs.** Panoptes reads Claude Code session logs (`~/.claude/projects`, or `CLAUDE_PROJECTS_DIR`) and Codex CLI rollouts (`~/.codex/sessions`, or `CODEX_HOME`). These logs can contain source code, file paths, prompts and secrets. Panoptes only reads them and never writes to them. To show branch status, it also runs `git status` and `git log -1` in each project folder, with `GIT_OPTIONAL_LOCKS=0` so they don't take the index lock.
- **It listens on localhost.** Both the dev server and the standalone server bind to `127.0.0.1` by default. **If you set `HOST` to another address, anyone who can reach that address can watch your session activity.** Only do that on a network you trust.
- **It sends summaries, not logs.** The browser gets events such as a file name, the start of a command, or a thinking summary. It doesn't get the raw log lines.
- **Secrets are masked best-effort.** Before text leaves the server, `server/redact.ts` masks common secret shapes: private keys, AWS/GitHub/Slack/Google/API keys, JWTs, `Bearer`/`Basic` credentials, credentials in URLs, and `PASSWORD=` / `TOKEN=`-style assignments. This is pattern matching, so a secret in an unusual format can get through. A pattern that misses a common secret format is a valid report.
- **Session requests are validated.** The `session` parameter of `/api/stream` is checked by `SessionTail.valid` in `server/watcher.ts`, which rejects path traversal.
- **Nothing leaves your machine.** There's no telemetry and no outbound network call.

## In scope

- Reading files outside the log folders, or outside `dist/` for the standalone server
- A secret format that redaction should mask but doesn't
- A way for a remote page or another machine to read the session stream under the default configuration
- Anything that lets the server be crashed or hijacked from the network

## Out of scope

- Exposure after you deliberately set `HOST` to a public address
- Attacks that need local access to your user account. That account can read the logs directly anyway.
