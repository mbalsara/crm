import { Button } from '@crm/ui';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@crm/ui';
import { Link } from 'react-router-dom';
import { container } from '@crm/shared';
import { Logger } from '@crm/shared';

export function HomePage() {
  const logger = container.resolve(Logger);

  const handleClick = () => {
    logger.info('Button clicked from HomePage!');
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">CRM Monorepo</h1>
          <p className="text-muted-foreground">
            TypeScript React monorepo with Drizzle, Hono, Turbo, and more
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome to CRM</CardTitle>
            <CardDescription>
              This is a fully configured monorepo with shared code between React and APIs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Features:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>TypeScript monorepo with pnpm workspaces</li>
                <li>Turbo for fast builds and caching</li>
                <li>React with Vite and Tailwind CSS</li>
                <li>Shared UI components with shadcn/ui</li>
                <li>Hono API server</li>
                <li>Drizzle ORM for database management</li>
                <li>Dependency injection with tsyringe</li>
                <li>Vitest for testing</li>
              </ul>
            </div>
            <div className="flex gap-4">
              <Button onClick={handleClick}>Click me!</Button>
              <Link to="/users">
                <Button variant="outline">View Users</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
