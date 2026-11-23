# Privacy

Last updated: 2026-11-24

Panoptes runs entirely on your computer. Its author doesn't collect, receive or store any data from it. There are no accounts, no telemetry and no analytics.

This applies to every way of running Panoptes: the Claude Code plugins, the `panoptes` command from the `panoptes-office` npm package, and a clone of this repository.

## What Panoptes reads

- **Session logs.** Claude Code logs in `~/.claude/projects` (or `CLAUDE_PROJECTS_DIR`) and Codex CLI rollouts in `~/.codex/sessions` (or `CODEX_HOME`). These hold whatever you and your agents wrote: prompts, file names, commands and code. That can include personal data such as names or email addresses, if you typed them or your files contain them.
- **Git state.** For each project folder it runs `git status` and reads the subject line of the last commit, to show the branch, the number of changed files and the latest commit. It doesn't read author names or email addresses.

Panoptes only reads these. It never changes or deletes them.

## What it does with them

- The local server turns log lines into short events, such as a file name, the start of a command, or a shortened prompt, and sends them to the Panoptes page in your browser. Both ends are on your computer.
- Before any text leaves the server, common secret formats are masked. This is pattern matching, so an unusual secret can get through. See [SECURITY.md](SECURITY.md).
- The server writes nothing to disk and keeps nothing after it stops.
- The page saves four display settings in your browser's local storage: theme, language, the floor you last opened and the order of the floors. Floors are named after your project folders. These stay in your browser.

## What leaves your computer

Nothing. Panoptes makes no outbound network calls.

The server listens on `127.0.0.1` and refuses requests that arrive under another domain name. If you choose to bind it to another address with `HOST` or `PANOPTES_HOST`, anyone who can reach that address can watch your session activity. That is a setting you control, and it's off by default.

## Other parties

- **GitHub and npm.** When you install the plugin or the npm package, GitHub or npm serves the download under its own privacy policy. Panoptes itself contacts neither.
- **Claude Code.** The plugin's commands run `panoptes open` or `panoptes stop`. The one line that command prints, a local address or a status message, becomes part of your Claude Code conversation like any other command output. No session content is sent back.

## Children

Panoptes is a developer tool and isn't directed at anyone under 18.

## Changes and questions

Changes to this policy are made in this file, and its history is in the repository. For questions, open an issue at https://github.com/smyeong123/panoptes/issues. To report a security problem, follow [SECURITY.md](SECURITY.md) instead.
