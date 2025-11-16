# CRM Monorepo

A modern, full-stack TypeScript monorepo for building a CRM application with shared code between React frontend and Hono API backend.

## Tech Stack

### Monorepo Tools

- **pnpm** - Fast, disk space efficient package manager
- **Turbo** - High-performance build system for monorepos
- **TypeScript** - Type-safe development across all packages

### Frontend

- **React 18** - UI library
- **Vite** - Lightning-fast build tool
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Beautifully designed components
- **React Router** - Client-side routing

### Backend

- **Hono** - Ultrafast web framework
- **Node.js** - Runtime environment
- **Drizzle ORM** - TypeScript ORM for SQL databases
- **PostgreSQL** - Database (via postgres.js)

### Shared

- **tsyringe** - Dependency injection container
- **Vitest** - Fast unit testing framework
- **tsup** - TypeScript bundler

## Project Structure

```
crm/
├── apps/
│   ├── web/              # React frontend application
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── services/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── api/              # Hono API application
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── di/
│       │   └── index.ts
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── shared/           # Shared utilities, types, and DI
│   │   ├── src/
│   │   │   ├── di/
│   │   │   ├── types/
│   │   │   ├── utils/
│   │   │   └── services/
│   │   └── package.json
│   │
│   ├── ui/               # Shared React components
│   │   ├── src/
│   │   │   ├── components/
│   │   │   └── lib/
│   │   ├── tailwind.config.js
│   │   └── package.json
│   │
│   └── database/         # Database schema and repositories
│       ├── src/
│       │   ├── schema/
│       │   ├── repositories/
│       │   └── db.ts
│       ├── drizzle.config.ts
│       └── package.json
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0

### Installation

```bash
# Install dependencies (use --ignore-scripts to avoid postinstall errors)
pnpm install --ignore-scripts

# Rebuild native dependencies
pnpm rebuild
```

### Database Setup

1. Create a PostgreSQL database:

```bash
createdb crm
```

2. Copy environment files:

```bash
cp packages/database/.env.example packages/database/.env
cp apps/api/.env.example apps/api/.env
```

3. Update the `DATABASE_URL` in `.env` files:

```
DATABASE_URL=postgresql://username:password@localhost:5432/crm
```

4. Generate and run migrations:

```bash
# Generate migration files
pnpm --filter @crm/database db:generate

# Push schema to database
pnpm --filter @crm/database db:push
```

### Development

Start all apps in development mode:

```bash
pnpm dev
```

Or start individual apps:

```bash
# Start web app (http://localhost:3000)
pnpm --filter @crm/web dev

# Start API server (http://localhost:4000)
pnpm --filter @crm/api dev

# Build and watch packages
pnpm --filter @crm/shared dev
pnpm --filter @crm/ui dev
pnpm --filter @crm/database dev
```

### Building

Build all packages and apps:

```bash
pnpm build
```

Build specific packages:

```bash
pnpm --filter @crm/shared build
pnpm --filter @crm/ui build
pnpm --filter @crm/database build
pnpm --filter @crm/web build
pnpm --filter @crm/api build
```

### Testing

Run tests across all packages:

```bash
pnpm test
```

Run tests for specific packages:

```bash
pnpm --filter @crm/shared test
pnpm --filter @crm/ui test
```

### Linting

Type-check all packages:

```bash
pnpm lint
```

## Key Features

### Dependency Injection with tsyringe

The monorepo uses tsyringe for dependency injection across all packages:

```typescript
// Define an injectable service
import { injectable } from "@crm/shared";

@injectable()
export class MyService {
  doSomething() {
    // ...
  }
}

// Use dependency injection
import { container } from "@crm/shared";

const service = container.resolve(MyService);
```

### Shared Code

Code is easily shared between frontend and backend:

```typescript
// In @crm/shared
export interface User {
  id: string;
  email: string;
  name: string;
}

// In @crm/web (React)
import type { User } from "@crm/shared";

// In @crm/api (Hono)
import type { User } from "@crm/shared";
```

### Database with Drizzle ORM

Type-safe database operations:

```typescript
// Define schema
import { pgTable, text, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
});

// Use in repositories
import { UserRepository } from "@crm/database";

const userRepo = container.resolve(UserRepository);
const users = await userRepo.findAll();
```

### UI Components

Reusable UI components with Tailwind CSS and shadcn/ui:

```typescript
import { Button, Card, CardHeader, CardTitle } from "@crm/ui";

function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hello World</CardTitle>
      </CardHeader>
      <Button>Click me</Button>
    </Card>
  );
}
```

## Available Scripts

### Root Level

- `pnpm dev` - Start all apps in development mode
- `pnpm build` - Build all packages and apps
- `pnpm test` - Run tests across all packages
- `pnpm lint` - Type-check all packages
- `pnpm clean` - Clean all build outputs and node_modules

### Database Package

- `pnpm --filter @crm/database db:generate` - Generate Drizzle migrations
- `pnpm --filter @crm/database db:push` - Push schema changes to database
- `pnpm --filter @crm/database db:studio` - Open Drizzle Studio

## API Endpoints

### Health Check

- `GET /health` - Check API health status

### Users

- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create a new user
- `PUT /api/users/:id` - Update a user
- `DELETE /api/users/:id` - Delete a user

## Environment Variables

### API (.env)

```
PORT=4000
DATABASE_URL=postgresql://localhost:5432/crm
```

### Database (.env)

```
DATABASE_URL=postgresql://localhost:5432/crm
```

## Troubleshooting

### Installation Issues

If you encounter errors during `pnpm install`, use:

```bash
pnpm install --ignore-scripts
pnpm rebuild
```

### Build Issues

If builds fail, try cleaning and rebuilding:

```bash
pnpm clean
pnpm install --ignore-scripts
pnpm rebuild
pnpm build
```

### Database Connection Issues

1. Ensure PostgreSQL is running
2. Verify DATABASE_URL is correct
3. Check database exists: `psql -l`

## Adding New Packages

To add a new package to the monorepo:

```bash
mkdir -p packages/my-package/src
cd packages/my-package
```

Create `package.json`:

```json
{
  "name": "@crm/my-package",
  "version": "1.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch"
  }
}
```

Then install dependencies from the root:

```bash
cd ../..
pnpm install
```

## Contributing

1. Create a new branch
2. Make your changes
3. Run tests: `pnpm test`
4. Run linting: `pnpm lint`
5. Build: `pnpm build`
6. Submit a pull request

## License

MIT
