# Panoptes plugin for Claude Code

An isometric office that moves along with your Claude Code sessions. This folder is the installable plugin. The project, screenshots and docs are in the [main README](https://github.com/smyeong123/panoptes#readme).

## Install

```
/plugin install panoptes --marketplace smyeong123/panoptes
```

## Use

| Command | What it does |
|---|---|
| `/panoptes:open` | Starts Panoptes if it isn't running, then opens http://127.0.0.1:4317 in your browser |
| `/panoptes:stop` | Stops it |

Panoptes needs Node.js 20 or later on your PATH. It keeps running in the background after the command returns, and stops by itself after 30 minutes with no page open.

## What it touches

Panoptes reads the session logs that Claude Code and Codex CLI write on your machine, listens on 127.0.0.1 only, and makes no outbound network calls. Details are in [SECURITY.md](https://github.com/smyeong123/panoptes/blob/main/SECURITY.md) and [docs/plugin.md](https://github.com/smyeong123/panoptes/blob/main/docs/plugin.md).

## About `dist/`

`dist/` is built from the TypeScript sources in the repository by `npm run build:plugin`. It's committed because installing a plugin doesn't run a build. Don't edit it by hand.
