# Panoptes for Claude Code

An isometric office that moves along with your Claude Code sessions. Screenshots and docs are in the [main README](https://github.com/smyeong123/panoptes#readme).

This plugin holds no program of its own. Its two commands run the `panoptes` command, which you install separately.

## Before you start

Install the Panoptes command by following [Install the command](https://github.com/smyeong123/panoptes#install-the-command). It needs Node.js 20 or later.

## Use

| Command | What it does |
|---|---|
| `/panoptes:open` | Starts Panoptes if it isn't running, then opens http://127.0.0.1:4317 in your browser |
| `/panoptes:stop` | Stops it |

Both commands run only when you type them, and Claude Code asks before each one runs. Panoptes keeps running in the background after the command returns, and stops by itself after 30 minutes with no page open.

## What it touches

Panoptes reads the session logs that Claude Code and Codex CLI write on your machine, listens on 127.0.0.1 only, and makes no outbound network calls. Details are in [SECURITY.md](https://github.com/smyeong123/panoptes/blob/main/SECURITY.md).
