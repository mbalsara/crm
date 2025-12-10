import { Button } from '@crm/ui';
import { Card, CardHeader, CardTitle, CardContent } from '@crm/ui';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // This would connect to your Hono API
    // For now, using mock data
    setTimeout(() => {
      setUsers([
        {
          id: '1',
          email: 'user1@example.com',
          name: 'John Doe',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          email: 'user2@example.com',
          name: 'Jane Smith',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Users</h1>
            <p className="text-muted-foreground">Manage your CRM users</p>
          </div>
          <Link to="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </div>

        {loading ? (
          <Card>
            <CardContent className="p-6">Loading users...</CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {users.map((user) => (
              <Card key={user.id}>
                <CardHeader>
                  <CardTitle>{user.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
