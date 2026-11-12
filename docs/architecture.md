# SafeSignal Architecture

## Overview

SafeSignal is organized as a TypeScript monorepo containing a Next.js frontend, a NestJS backend API, a shared Prisma database layer, and a private local file storage directory.

## Repository Structure

- `apps/web`: Next.js frontend (App Router, React, TypeScript, Tailwind CSS)
- `apps/api`: NestJS backend service (TypeScript)
- `prisma`: Shared PostgreSQL schema and database migrations
- `storage`: Private local file storage directory (contents ignored by Git)
- `docs`: Project documentation

## Local Services & Ports

| Service    | Default Address          | Notes                                  |
| ---------- | ------------------------ | -------------------------------------- |
| Web        | `http://localhost:3000`  | Next.js App Router development server  |
| API        | `http://localhost:3001`  | NestJS HTTP server                     |
| PostgreSQL | `localhost:5432`         | Managed via `docker-compose.yml`       |

## Database & Storage

- **PostgreSQL + Prisma**: The canonical schema lives at `prisma/schema.prisma`. Root scripts expose `db:generate`, `db:migrate`, `db:push`, and `db:studio`.
- **Private Local Storage**: The `storage/` directory holds private uploaded/generated files locally during development. Files placed inside `storage/` are excluded from version control via `.gitignore`.
