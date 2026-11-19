# Claude Code plugin

Panoptes ships as a Claude Code plugin, so you can start it from a session without cloning the repo. The plugin is a launcher: it starts the same local server as `npm start` and opens the same page in your browser.

## Install

You need Node.js 20 or later on your PATH.

In a Claude Code terminal session:

```
/plugin install panoptes --marketplace smyeong123/panoptes
```

From a shell:

```bash
claude plugin install panoptes --marketplace smyeong123/panoptes
```

In the desktop app, click **+** next to the prompt box, then **Plugins**, add the marketplace `smyeong123/panoptes`, and add the plugin.

## Commands

| Command | What it does |
|---|---|
| `/panoptes:open` | Starts Panoptes if it isn't running, then opens the page in your browser |
| `/panoptes:stop` | Stops it |

Both commands run only when you type them. Claude doesn't start Panoptes on its own.

## How it runs

- `/panoptes:open` starts the server as a background process on `http://127.0.0.1:4317`. It keeps running after the command returns and after the session ends, so the page stays up while you work in other sessions.
- If Panoptes is already running, `/panoptes:open` reuses it and only opens the page.
- The server stops by itself after 30 minutes with no page open.
- After a plugin update, the next `/panoptes:open` replaces a server left over from the old version.
- If another program is using the port, the command says so and starts nothing.

## Configuration

Set these in the environment Claude Code starts from. All of them are optional.

| Variable | Default | What it does |
|---|---|---|
| `PANOPTES_PORT` | `4317` | Port the plugin's server uses |
| `PANOPTES_HOST` | `127.0.0.1` | Address it binds to |
| `PANOPTES_IDLE_MINUTES` | `30` | Minutes with no page open before the server stops. `0` keeps it running |
| `CLAUDE_PROJECTS_DIR`, `CODEX_HOME` | see [configuration.md](configuration.md) | Log folders to read |

The plugin ignores `HOST` and `PORT` on purpose. Shells and project tools often export them for other things, such as a dev server port, and a background process shouldn't move to that port or bind to a public address because of them.

> **Warning:** binding to anything other than `127.0.0.1` lets anyone who can reach that address watch your session activity. See [SECURITY.md](../SECURITY.md).

## What's in the plugin

The repo root is the marketplace, and `plugin/` is the plugin.

| Path | Role |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace `smyeong123` with one entry, `panoptes`, pointing at `./plugin` |
| `plugin/.claude-plugin/plugin.json` | Plugin manifest. Its `version` is copied from `package.json` by the build |
| `plugin/.claude-plugin/icon.png` | Listing icon |
| `plugin/skills/open`, `plugin/skills/stop` | The two commands. Each runs one fixed launcher command |
| `plugin/dist/panoptes.mjs` | Built. The server and the launcher (`server/cli.ts`) in one file with no dependencies |
| `plugin/dist/web/` | Built. The page |

## Building

Installing a plugin copies the repo and runs no build, so `plugin/dist/` is committed.

```bash
npm run build:plugin
```

Run it whenever you change `server/`, `shared/`, `src/`, `index.html`, `public/` or `package.json`, and commit the result with your change. `test/pluginBundle.test.ts` rebuilds into a temporary folder and fails `npm test` if the committed files differ. It also starts the committed launcher on a spare port, checks the page and the health check, and stops it.

Don't edit `plugin/dist/` by hand.

## Releasing

1. Bump `version` in `package.json`. Claude Code uses the plugin version to decide whether an installed copy is out of date, so bump it for every release.
2. Run `npm run build:plugin`. It rebuilds `plugin/dist/` and copies the version into `plugin/.claude-plugin/plugin.json`.
3. Run `npm test && npm run build`, then check the manifests:

   ```bash
   claude plugin validate . --strict
   claude plugin validate plugin --strict --profile directory
   ```

4. Merge to `main`, then tag the release from `main`:

   ```bash
   claude plugin tag plugin --push    # creates panoptes--v<version>
   ```

Users get the new version with `claude plugin update panoptes@smyeong123`.

## Listing in the plugin directory

Plugins are submitted at [claude.ai/directory/manage](https://claude.ai/directory/manage). The `--profile directory` check above covers part of what the directory checks. The directory also runs its own safety scan and policy review.

The icon can only be set once, the first time the plugin is saved or submitted there. Check `plugin/.claude-plugin/icon.png` before you submit.
