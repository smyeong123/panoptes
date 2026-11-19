# Security Policy

## Supported versions

Security fixes go to the latest `main` branch only. The Claude Code plugin is built from `main`, so update the plugin to get them.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the problem, how to reproduce it, and what it could expose.

This is a side project maintained on a best-effort basis. I'll aim to acknowledge reports within a week and will credit you in the fix unless you'd rather stay anonymous.

## What Panoptes touches

It helps to know Panoptes's threat model when judging whether something is a vulnerability.

- **It reads local logs.** Panoptes reads Claude Code session logs (`~/.claude/projects`, or `CLAUDE_PROJECTS_DIR`) and Codex CLI rollouts (`~/.codex/sessions`, or `CODEX_HOME`). These logs can contain source code, file paths, prompts and secrets. Panoptes only reads them and never writes to them. To show branch status, it also runs `git status` and `git log -1` in each project folder, with `GIT_OPTIONAL_LOCKS=0` so they don't take the index lock.
- **It listens on localhost.** The dev server, the standalone server and the plugin all bind to `127.0.0.1` by default. **If you set `HOST` (or `PANOPTES_HOST` for the plugin) to another address, anyone who can reach that address can watch your session activity.** Only do that on a network you trust.
- **It answers only to local names.** A request is refused with 403 unless its `Host` header is an IP address, `localhost`, or the `HOST` value you set. This blocks DNS rebinding, where a remote page points its own domain at `127.0.0.1` so that your browser lets it read the session stream. The check is `isLocalHost` in `server/host.ts`, and it covers the dev server's stream as well.
- **The plugin keeps a server running.** `/panoptes:open` starts the server as a background process that outlives the session. It stops on `/panoptes:stop`, or by itself after 30 minutes with no page open. It starts only when you type the command, and it reads `PANOPTES_HOST` and `PANOPTES_PORT` rather than `HOST` and `PORT`, so a variable exported for something else can't move it or expose it.
- **The health check names the process.** `GET /api/health` on the standalone server and the plugin returns the app name, version and process id. The plugin uses it to find and stop its own server.
- **It sends summaries, not logs.** The browser gets events such as a file name, the start of a command, or a thinking summary. It doesn't get the raw log lines.
- **Secrets are masked best-effort.** Before text leaves the server, `server/redact.ts` masks common secret shapes: private keys, AWS/GitHub/Slack/Google/API keys, JWTs, `Bearer`/`Basic` credentials, credentials in URLs, and `PASSWORD=` / `TOKEN=`-style assignments. This is pattern matching, so a secret in an unusual format can get through. A pattern that misses a common secret format is a valid report.
- **Session requests are validated.** The `session` parameter of `/api/stream` is checked by `SessionTail.valid` in `server/watcher.ts`, which rejects path traversal.
- **Nothing leaves your machine.** There's no telemetry and no outbound network call.

## In scope

- Reading files outside the log folders, or outside the page folder the server serves (`dist/`, or `plugin/dist/web` for the plugin)
- A secret format that redaction should mask but doesn't
- A way for a remote page or another machine to read the session stream under the default configuration
- Anything that lets the server be crashed or hijacked from the network

## Out of scope

- Exposure after you deliberately set `HOST` to a public address
- Attacks that need local access to your user account. That account can read the logs directly anyway.
