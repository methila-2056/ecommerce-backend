# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |

## Reporting a vulnerability

If you discover a security vulnerability in this project, please report it responsibly:

1. **Do not open a public GitHub issue** for the vulnerability.
2. Use GitHub's [private vulnerability reporting](https://github.com/methila-2056/ecommerce-backend/security/advisories/new) to submit a report, or contact the maintainer directly via the profile page.
3. Include as much detail as possible: affected endpoint(s), reproduction steps, impact assessment, and any proof-of-concept code.

You can expect an initial response within **72 hours**. Please allow reasonable time for a fix before any public disclosure — coordinated disclosure is appreciated.

## Scope

The following areas are of particular interest:

- Authentication and JWT refresh-token rotation (`src/` auth modules)
- Authorization checks on admin-only endpoints
- Payment and checkout transaction integrity
- Input validation (Zod schemas) and injection vectors
- Rate limiting and brute-force protection
- Secrets handling in deployment configuration (Vercel / Render / Docker)

## Known non-issues

- The demo accounts documented in the README are intentionally seeded with weak credentials for evaluation purposes only.
- `.env.example` contains placeholder values by design.
