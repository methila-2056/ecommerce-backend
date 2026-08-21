# Contributing to E-Commerce Backend System

Thanks for your interest in contributing! This document describes how to set up the project locally and the conventions used in this repository.

## Getting started

### Prerequisites

- **Node.js 20+** (see `.nvmrc`)
- **npm 10+**
- A running **MongoDB** instance (or use `docker-compose up` for a local one)

### Setup

```bash
git clone https://github.com/methila-2056/ecommerce-backend.git
cd ecommerce-backend
npm install
cp .env.example .env   # fill in the required values
npm run dev
```

The API starts on `http://localhost:3000` by default. Interactive OpenAPI docs are served at `/api/v1/docs`.

## Development workflow

1. Fork the repository and create a branch from `main`:
   - `feat/<short-description>` for new features
   - `fix/<short-description>` for bug fixes
   - `docs/<topic>` or `chore/<topic>` for non-code changes
2. Make your changes with focused, atomic commits.
3. Before pushing, make sure everything passes:

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript strict mode
npm run test        # Vitest integration tests (in-memory MongoDB)
```

4. Open a pull request against `main` with a clear description of what changed and why.

## Commit message convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short summary in imperative mood>

Examples:
feat: add coupon redemption endpoint
fix: prevent duplicate refresh-token reuse
docs: expand deployment guide for Render
chore: bump mongoose to 9.x
refactor: extract payment provider abstraction
test: cover checkout inventory rollback path
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`.

## Code style

- Formatting is enforced by **Prettier** and linting by **ESLint** via `husky` + `lint-staged` on every commit — just write code and let the hooks format it.
- TypeScript runs in **strict mode**; avoid `any` and non-null assertions where a proper type works.
- New endpoints must be covered by integration tests in `tests/` and documented in `docs/openapi.yaml`.
- Never commit secrets. Use `.env` (gitignored) for local configuration and update `.env.example` when adding new variables.

## Reporting issues

- Bug reports: use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md)
- Feature ideas: use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md)
- Security vulnerabilities: **do not** open a public issue — see [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the [ISC License](LICENSE) that covers this project.
