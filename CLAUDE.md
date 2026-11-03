# Panoptes: agent notes

- **Docs rule:** technical notes live in `docs/` (English). The README (`README.md` + `README.ko.md`) stays short. It only says what Panoptes is and how to start it, and the two files are kept in sync. Whenever behaviour, configuration or architecture changes, update the matching doc in `docs/` in the same change. Index: `docs/README.md`.
- **Verification gate:** `npm test && npm run build` must pass before proposing a commit.
- **UI text** goes through `src/i18n.ts` with both `ko` and `en` entries.
- **Never commit real session logs.** Test fixtures are synthetic.
- Contribution and security rules: `CONTRIBUTING.md`, `SECURITY.md`.
