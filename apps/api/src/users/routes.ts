import { Hono } from 'hono';
import { container, NotFoundError } from '@crm/shared';
import { UserService } from './service';
import type { ApiResponse } from '@crm/shared';
import { errorHandler } from '../middleware/errorHandler';

export const userRoutes = new Hono();

// Apply error handling middleware
userRoutes.use('*', errorHandler);

userRoutes.get('/', async (c) => {
  const userService = container.resolve(UserService);
  const users = await userService.getAllUsers();

  return c.json<ApiResponse<typeof users>>({
    success: true,
    data: users,
  });
});

userRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const userService = container.resolve(UserService);
  const user = await userService.getUserById(id);

  if (!user) {
    throw new NotFoundError('User', id);
  }

  return c.json<ApiResponse<typeof user>>({
    success: true,
    data: user,
  });
});

userRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const userService = container.resolve(UserService);
  const user = await userService.createUser(body);

  return c.json<ApiResponse<typeof user>>(
    {
      success: true,
      data: user,
    },
    201
  );
});

userRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const userService = container.resolve(UserService);
  const user = await userService.updateUser(id, body);

  if (!user) {
    throw new NotFoundError('User', id);
  }

  return c.json<ApiResponse<typeof user>>({
    success: true,
    data: user,
  });
});

userRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const userService = container.resolve(UserService);
  const success = await userService.deleteUser(id);

  if (!success) {
    throw new NotFoundError('User', id);
  }

  return c.json<ApiResponse<{ deleted: boolean }>>({
    success: true,
    data: { deleted: true },
  });
});
