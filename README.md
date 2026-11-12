# SafeSignal

SafeSignal is an open-source digital safety and accountability platform.

This repository is organized as a TypeScript monorepo with a Next.js frontend, a NestJS backend API, a shared Prisma schema and migrations directory, and private local file storage for development.

## Repository Structure

```text
SafeSignal/
├── apps/
│   ├── api/            # NestJS backend API (TypeScript)
│   └── web/            # Next.js frontend (App Router, React, TypeScript, Tailwind CSS)
├── docs/               # Project documentation
├── prisma/             # Shared Prisma schema and migrations
├── storage/            # Private local file storage (contents gitignored)
├── docker-compose.yml  # Local PostgreSQL service
├── tsconfig.base.json  # Shared TypeScript compiler configuration
└── .env.example        # Environment variable template
```

## Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend:** NestJS, TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **Infrastructure:** Docker Compose (PostgreSQL), npm workspaces

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or later (includes `npm`)
- [Docker](https://www.docker.com/) and Docker Compose

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Update `.env` if you need custom ports or credentials (for example, changing `POSTGRES_PORT` and `DATABASE_URL` if port `5432` is already occupied on your machine).

3. **Start PostgreSQL**

   ```bash
   npm run db:up
   ```

4. **Generate Prisma client and sync the database**

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

5. **Run the development servers**

   ```bash
   npm run dev
   ```

   - Web application: `http://localhost:3000`
   - API server: `http://localhost:3001` (health check at `GET /health`)

## Root Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start both `apps/api` and `apps/web` concurrently in watch mode |
| `npm run dev:api` | Start the NestJS API in watch mode |
| `npm run dev:web` | Start the Next.js development server |
| `npm run build` | Build both `apps/api` and `apps/web` |
| `npm run build:api` | Build the NestJS API |
| `npm run build:web` | Build the Next.js frontend |
| `npm run typecheck` | Run `tsc --noEmit` across both applications |
| `npm run db:up` | Start PostgreSQL via Docker Compose |
| `npm run db:down` | Stop the PostgreSQL Docker Compose service |
| `npm run db:generate` | Generate the Prisma Client from `prisma/schema.prisma` |
| `npm run db:migrate` | Create and apply Prisma migrations in development |
| `npm run db:push` | Push schema state directly to PostgreSQL without migrations |
| `npm run db:studio` | Open Prisma Studio |

## Environment Variables

See [`.env.example`](./.env.example) for all supported variables:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` — PostgreSQL container configuration
- `DATABASE_URL` — PostgreSQL connection string used by Prisma and the API
- `API_PORT` — Port for the NestJS API server (default: `3001`)
- `CORS_ORIGIN` — Allowed CORS origin(s) for the API (default: `http://localhost:3000`)
- `STORAGE_PATH` — Local directory path for private file storage (default: `./storage`)
- `NEXT_PUBLIC_API_URL` — Public API base URL exposed to the Next.js frontend

## Documentation

Additional architectural notes are available in [`docs/architecture.md`](./docs/architecture.md).
