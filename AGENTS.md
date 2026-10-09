# Bitácoras Institucionales

When the user asks to work on this project, use this repository: `/home/zaid/Downloads/bitacoras-institucionales`.

## Architecture
- Internal Spanish-language radiotherapy log application.
- Frontend: Next.js, React, Tailwind CSS 4, and shadcn/ui in `frontend/`.
- API: Express with local SQLite in `backend/`; the database is created locally under `backend/data/`.
- `scripts/run.mjs` starts the API and frontend together and handles development ports.

## Useful commands (repository root)
- `npm run dev` — start the API and frontend together.
- `pnpm test` — backend/API tests.
- `pnpm run build` — production build.
- No lint script is currently configured.

Read `README.md` before changing setup or behavior. Preserve existing local work. Never stage, print, or commit `.env`; it is ignored by Git. `.env.example` is the shareable template. Keep local databases, backups, and test artifacts out of Git.
