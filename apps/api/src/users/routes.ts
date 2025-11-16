import { Hono } from 'hono';
import { container } from '@crm/shared';
import { UserService } from './service';
import type { ApiResponse } from '@crm/shared';

export const userRoutes = new Hono();

userRoutes.get('/', async (c) => {
  try {
    const userService = container.resolve(UserService);
    const users = await userService.getAllUsers();

    return c.json<ApiResponse<typeof users>>({
      success: true,
      data: users,
    });
  } catch (error) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

userRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const userService = container.resolve(UserService);
    const user = await userService.getUserById(id);

    if (!user) {
      return c.json<ApiResponse<never>>(
        {
          success: false,
          error: 'User not found',
        },
        404
      );
    }

    return c.json<ApiResponse<typeof user>>({
      success: true,
      data: user,
    });
  } catch (error) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

userRoutes.post('/', async (c) => {
  try {
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
  } catch (error) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

userRoutes.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const userService = container.resolve(UserService);
    const user = await userService.updateUser(id, body);

    if (!user) {
      return c.json<ApiResponse<never>>(
        {
          success: false,
          error: 'User not found',
        },
        404
      );
    }

    return c.json<ApiResponse<typeof user>>({
      success: true,
      data: user,
    });
  } catch (error) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

userRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const userService = container.resolve(UserService);
    const success = await userService.deleteUser(id);

    if (!success) {
      return c.json<ApiResponse<never>>(
        {
          success: false,
          error: 'User not found',
        },
        404
      );
    }

    return c.json<ApiResponse<{ deleted: boolean }>>({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
