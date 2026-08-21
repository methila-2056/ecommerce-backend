# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- GitHub community health files: `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue and pull request templates
- `.editorconfig` and `.nvmrc` for consistent editor and Node.js versions

## [1.0.0] - 2026

### Added

- Authentication module: JWT access tokens with refresh-token rotation, bcrypt password hashing
- Product catalog: search, filtering, pagination, categories
- Transactional checkout pipeline: orders → coupons → payments → inventory
- Reviews, wishlists, notifications modules
- Admin dashboard endpoints with audit trail
- 25+ RESTful endpoints across 13 feature modules
- Interactive OpenAPI documentation served at `/api/v1/docs`
- Integration test suite (18 tests) running against in-memory MongoDB replica set
- CI workflow (lint, typecheck, tests) on every push to `main`
- Docker support (`Dockerfile`, `docker-compose.yml`)
- Deployment configuration for Vercel and Render

[Unreleased]: https://github.com/methila-2056/ecommerce-backend/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/methila-2056/ecommerce-backend/releases/tag/v1.0.0
