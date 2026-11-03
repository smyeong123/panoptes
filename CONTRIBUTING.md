# Contributing to Panoptes

Thanks for your interest. Bug reports, fixes and new features are all welcome.

## Setup

You need Node.js 22 or later.

```bash
npm install
npm run dev        # Vite dev server with the live bridge, http://127.0.0.1:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-checks, then builds `dist/` |
| `npm start` | Serves `dist/` with the standalone server, http://127.0.0.1:4317 |
| `npm test` | Runs the Vitest suite |
| `npm run typecheck` | Type-checks only |

For how the code fits together, start with [docs/architecture.md](docs/architecture.md).

## Making a change

1. For anything bigger than a small fix, open an issue first so we can agree on the approach.
2. Fork the repo and create a branch named `<type>/<short-desc>`, e.g. `fix/codex-link-timeout` or `feat/kitchen-room`.
3. Keep each pull request to one concern.
4. Write commit messages in [Conventional Commits](https://www.conventionalcommits.org/) style: `<type>(<scope>): <description>`, imperative and lower-case. Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`.
5. Before opening the PR, make sure this passes:

   ```bash
   npm test && npm run build
   ```

## Rules of thumb

- **Tests.** Changes to the parsers (`server/parse.ts`, `server/parseCodex.ts`), the redaction layer, or the state machine (`src/state/office.ts`) need tests in `test/`.
- **Docs.** Technical notes belong in [`docs/`](docs/README.md). When you change behaviour, configuration or architecture, update the matching doc in the same PR. Keep the README short: it only says what Panoptes is and how to start it.
- **UI text.** All user-visible strings go through `src/i18n.ts`, with both a `ko` and an `en` entry.
- **No real session logs.** Never commit real `.jsonl` logs, even trimmed ones. They can contain code, paths, prompts and secrets. Test fixtures must be synthetic.
- **Style.** Match the code around you. Run `npm run typecheck` before pushing.

## Security issues

Please don't open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md) instead.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
