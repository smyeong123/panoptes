# Claude Code plugin

Panoptes ships as a Claude Code plugin, so you can start it from a session without cloning the repo. The plugin is a launcher: it starts the same local server as `npm start` and opens the same page in your browser.

There are two editions with the same two commands:

| Edition | Folder | Where it's listed | Holds the program? |
|---|---|---|---|
| Self-contained | `plugin/` | this repo's own marketplace | Yes. Nothing else to install |
| Directory | `plugin-directory/` | the official plugin directory | No. It runs the `panoptes` command, which you install from npm |

Install one or the other. This page describes the self-contained edition first. The [directory edition](#directory-edition) and the [`panoptes` command](#the-panoptes-command) have their own sections.

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
| `PANOPTES_HOST` | `127.0.0.1` | Address it binds to. The page then answers to that value, to any IP address and to `localhost`, and refuses other hostnames |
| `PANOPTES_IDLE_MINUTES` | `30` | Minutes with no page open before the server stops. `0` keeps it running |
| `CLAUDE_PROJECTS_DIR`, `CODEX_HOME` | see [configuration.md](configuration.md) | Log folders to read |

The plugin ignores `HOST` and `PORT` on purpose. Shells and project tools often export them for other things, such as a dev server port, and a background process shouldn't move to that port or bind to a public address because of them.

> **Warning:** binding to anything other than `127.0.0.1` lets anyone who can reach that address watch your session activity. See [SECURITY.md](../SECURITY.md).

## What's in the plugin

The repo root is the marketplace, and `plugin/` is the plugin.

| Path | Role |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace `smyeong123` with one entry, `panoptes`, pointing at `./plugin` |
| `plugin/.claude-plugin/plugin.json` | Plugin manifest. Its `version` is copied from `package.json` by the build, and `privacyPolicyUrl` points at [PRIVACY.md](../PRIVACY.md) |
| `plugin/.claude-plugin/icon.png` | Listing icon |
| `plugin/skills/open`, `plugin/skills/stop` | The two commands. Each runs one fixed launcher command |
| `plugin/dist/panoptes.mjs` | Built. The server and the launcher (`server/cli.ts`) in one file with no dependencies |
| `plugin/dist/web/` | Built. The page |

## The `panoptes` command

The launcher is also published to npm as `panoptes-office`, which installs a `panoptes` command:

```bash
npm install -g panoptes-office
panoptes open        # same as /panoptes:open
panoptes stop
panoptes status
panoptes --version
```

It is the same file the self-contained plugin runs (`plugin/dist/panoptes.mjs`), so everything under [How it runs](#how-it-runs) and [Configuration](#configuration) applies to it. The package holds only `plugin/dist/` and has no dependencies.

## Directory edition

The official plugin directory accepts code files, and pre-approved tools beyond Read, Grep, Glob and LS, only from Verified organizations. `plugin-directory/` is an edition that meets those rules: it holds only Markdown, JSON and the icon.

- Its skills run `panoptes open` and `panoptes stop`, so the [`panoptes` command](#the-panoptes-command) has to be installed first. If it isn't, the skill says so and links to the install steps. It never installs anything itself.
- It pre-approves no tools, so Claude Code asks before each run.
- Keep it free of code, `allowed-tools`, `${...}` paths and package-manager command lines, or the directory will refuse it. Install steps belong in the main README, which the skills link to.

`npm run build:plugin` copies the version into its `plugin.json` too.

## Building

Installing a plugin copies the repo and runs no build, so `plugin/dist/` is committed.

```bash
npm run build:plugin
```

Run it whenever you change `server/`, `shared/`, `src/`, `index.html`, `public/` or `package.json`, and commit the result with your change. `test/pluginBundle.test.ts` rebuilds into a temporary folder and fails `npm test` if the committed files differ. It also starts the committed launcher on a spare port, checks the page and the health check, and stops it.

Don't edit `plugin/dist/` by hand.

## Releasing

1. Bump `version` in `package.json`. Claude Code uses the plugin version to decide whether an installed copy is out of date, so bump it for every release.
2. Run `npm run build:plugin`. It rebuilds `plugin/dist/` and copies the version into the `plugin.json` of both editions.
3. Run `npm test && npm run build`, then check the manifests:

   ```bash
   claude plugin validate . --strict
   claude plugin validate plugin --strict --profile directory
   ```

4. Merge to `main`, then tag the release from `main`:

   ```bash
   claude plugin tag plugin --push    # creates panoptes--v<version>
   ```

5. Publish the command to npm from the same commit. `prepublishOnly` runs the tests first, which include the stale-build check:

   ```bash
   npm publish
   ```

Users of the self-contained edition get the new version with `claude plugin update panoptes@smyeong123`, and users of the command with `npm install -g panoptes-office@latest`.

## Listing in the plugin directory

Plugins are submitted at [claude.ai/directory/manage](https://claude.ai/directory/manage), with `plugin-directory` as the plugin path. Submit the [directory edition](#directory-edition), not `plugin/`: the directory refuses the bundled program from an organization that isn't Verified. Check it first with `claude plugin validate plugin-directory --strict --profile directory`. That covers part of what the directory checks, and the directory also runs its own safety scan and policy review.

The directory asks how the plugin handles data. The answers that match [PRIVACY.md](../PRIVACY.md) are: it reads personal data but doesn't store it (session logs can contain anything you typed), it sends nothing to other services, nothing is retained, and it isn't intended for users under 18. Both plugin manifests carry `privacyPolicyUrl`, which the directory looks for when a plugin reads personal data. If you change what Panoptes reads, stores or sends, update PRIVACY.md and SECURITY.md in the same change.

The icon can only be set once, the first time the plugin is saved or submitted there. Check `plugin-directory/.claude-plugin/icon.png` before you submit.
