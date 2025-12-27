/**
 * Notification API routes
 */

import { Hono } from 'hono';
import { container } from 'tsyringe';
import {
  NotificationService,
  DeliveryService,
  PreferencesService,
  ActionService,
  NotificationRepository,
  NotificationTypeRepository,
  sendNotificationRequestSchema,
  createNotificationTypeRequestSchema,
  updateUserPreferencesRequestSchema,
  subscribeRequestSchema,
  actionRequestSchema,
  batchActionRequestSchema,
} from '@crm/notifications';
import type { RequestHeader } from '@crm/shared';
import { logger } from '../utils/logger';
import { getRequestHeader } from '../utils/request-header';

const app = new Hono();

/**
 * Send notification (fan-out to subscribers)
 */
app.post('/send', async (c) => {
  const header = getRequestHeader(c);
  const body = await c.req.json();

  const validationResult = sendNotificationRequestSchema.safeParse(body);
  if (!validationResult.success) {
    logger.error({ errors: validationResult.error.issues }, 'Invalid send notification request');
    return c.json({ success: false, error: 'Invalid request', details: validationResult.error.issues }, 400);
  }

  try {
    const notificationService = container.resolve<NotificationService>(NotificationService);
    const result = await notificationService.sendNotification(validationResult.data, header);

    return c.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to send notification');
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Create notification type
 */
app.post('/types', async (c) => {
  const header = getRequestHeader(c);
  const body = await c.req.json();

  const validationResult = createNotificationTypeRequestSchema.safeParse({
    ...body,
    tenantId: header.tenantId,
  });
  if (!validationResult.success) {
    logger.error({ errors: validationResult.error.issues }, 'Invalid create notification type request');
    return c.json({ success: false, error: 'Invalid request', details: validationResult.error.issues }, 400);
  }

  try {
    const typeRepo = container.resolve<NotificationTypeRepository>('NotificationTypeRepository');
    const result = await typeRepo.create(validationResult.data, header);

    return c.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to create notification type');
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Get notification types
 */
app.get('/types', async (c) => {
  const header = getRequestHeader(c);

  try {
    const typeRepo = container.resolve<NotificationTypeRepository>('NotificationTypeRepository');
    const types = await typeRepo.findAll(header);

    return c.json({ success: true, data: { types } });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get notification types');
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Get user preferences
 */
app.get('/preferences', async (c) => {
  const header = getRequestHeader(c);

  try {
    const preferencesService = container.resolve<PreferencesService>(PreferencesService);
    const preferences = await preferencesService.getUserPreferences(header.userId, header);

    return c.json({ success: true, data: { preferences } });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get user preferences');
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Update user preferences for a notification type
 */
app.put('/preferences/:typeId', async (c) => {
  const header = getRequestHeader(c);
  const typeId = c.req.param('typeId');
  const body = await c.req.json();

  const validationResult = updateUserPreferencesRequestSchema.safeParse({
    ...body,
    notificationTypeId: typeId,
  });
  if (!validationResult.success) {
    logger.error({ errors: validationResult.error.issues }, 'Invalid update preferences request');
    return c.json({ success: false, error: 'Invalid request', details: validationResult.error.issues }, 400);
  }

  try {
    const preferencesService = container.resolve<PreferencesService>(PreferencesService);
    const result = await preferencesService.updatePreference(
      header.userId,
      typeId,
      validationResult.data,
      header
    );

    return c.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to update preferences');
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Subscribe to notification type
 */
app.post('/subscribe', async (c) => {
  const header = getRequestHeader(c);
  const body = await c.req.json();

  const validationResult = subscribeRequestSchema.safeParse(body);
  if (!validationResult.success) {
    logger.error({ errors: validationResult.error.issues }, 'Invalid subscribe request');
    return c.json({ success: false, error: 'Invalid request', details: validationResult.error.issues }, 400);
  }

  try {
    const preferencesService = container.resolve<PreferencesService>(PreferencesService);
    const result = await preferencesService.subscribe(header.userId, validationResult.data, header);

    return c.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to subscribe');
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Unsubscribe from notification type
 */
app.post('/unsubscribe/:typeId', async (c) => {
  const header = getRequestHeader(c);
  const typeId = c.req.param('typeId');

  try {
    const preferencesService = container.resolve<PreferencesService>(PreferencesService);
    await preferencesService.unsubscribe(header.userId, typeId, header);

    return c.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to unsubscribe');
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Get user notifications
 */
app.get('/notifications', async (c) => {
  const header = getRequestHeader(c);
  const status = c.req.query('status')?.split(',');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    const notificationRepo = container.resolve<NotificationRepository>('NotificationRepository');
    const notifications = await notificationRepo.findByUser(header.userId, header, {
      status,
      limit,
      offset,
    });

    return c.json({ success: true, data: { notifications } });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get notifications');
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Get single notification
 */
app.get('/notifications/:id', async (c) => {
  const header = getRequestHeader(c);
  const id = c.req.param('id');

  try {
    const notificationRepo = container.resolve<NotificationRepository>('NotificationRepository');
    const notification = await notificationRepo.findById(id, header);

    if (!notification) {
      return c.json({ success: false, error: 'Notification not found' }, 404);
    }

    return c.json({ success: true, data: notification });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get notification');
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Mark notification as read
 */
app.post('/notifications/:id/read', async (c) => {
  const header = getRequestHeader(c);
  const id = c.req.param('id');

  try {
    const notificationRepo = container.resolve<NotificationRepository>('NotificationRepository');
    const result = await notificationRepo.markAsRead(id, header);

    if (!result) {
      return c.json({ success: false, error: 'Notification not found' }, 404);
    }

    return c.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to mark notification as read');
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Perform action on notification
 */
app.post('/notifications/:id/action', async (c) => {
  const header = getRequestHeader(c);
  const id = c.req.param('id');
  const body = await c.req.json();

  const validationResult = actionRequestSchema.safeParse(body);
  if (!validationResult.success) {
    logger.error({ errors: validationResult.error.issues }, 'Invalid action request');
    return c.json({ success: false, error: 'Invalid request', details: validationResult.error.issues }, 400);
  }

  try {
    const actionService = container.resolve<ActionService>(ActionService);
    const result = await actionService.performAction(
      {
        notificationId: id,
        actionType: validationResult.data.actionType,
        actionData: validationResult.data.actionData,
      },
      header
    );

    return c.json({ success: result.success, data: result });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to perform action');
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Perform batch action
 */
app.post('/notifications/batch-action', async (c) => {
  const header = getRequestHeader(c);
  const body = await c.req.json();

  const validationResult = batchActionRequestSchema.safeParse(body);
  if (!validationResult.success) {
    logger.error({ errors: validationResult.error.issues }, 'Invalid batch action request');
    return c.json({ success: false, error: 'Invalid request', details: validationResult.error.issues }, 400);
  }

  try {
    const actionService = container.resolve<ActionService>(ActionService);
    const result = await actionService.performBatchAction(validationResult.data, header);

    return c.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to perform batch action');
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Handle action via token (one-click from email)
 */
app.get('/actions/:actionType', async (c) => {
  const token = c.req.query('token');

  if (!token) {
    return c.json({ success: false, error: 'Token required' }, 400);
  }

  try {
    const actionService = container.resolve<ActionService>(ActionService);
    const result = await actionService.performActionViaToken(token);

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    // Redirect to success page or return JSON based on Accept header
    const acceptsHtml = c.req.header('Accept')?.includes('text/html');
    if (acceptsHtml) {
      return c.html(`
        <!DOCTYPE html>
        <html>
          <head><title>Action Completed</title></head>
          <body>
            <h1>Action completed successfully!</h1>
            <p>You can close this window.</p>
          </body>
        </html>
      `);
    }

    return c.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to perform action via token');
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Unsubscribe via link (one-click from email)
 */
app.get('/unsubscribe', async (c) => {
  const notificationId = c.req.query('nid');
  const typeId = c.req.query('type');

  if (!notificationId || !typeId) {
    return c.json({ success: false, error: 'Invalid unsubscribe link' }, 400);
  }

  try {
    // Get notification to find user
    const notificationRepo = container.resolve<NotificationRepository>('NotificationRepository');
    const notification = await notificationRepo.findById(notificationId, {
      tenantId: '',
      userId: '',
      permissions: [],
    } as RequestHeader);

    if (!notification) {
      return c.json({ success: false, error: 'Invalid unsubscribe link' }, 400);
    }

    const header: RequestHeader = {
      tenantId: notification.tenantId,
      userId: notification.userId,
      permissions: [],
    };

    const preferencesService = container.resolve<PreferencesService>(PreferencesService);
    await preferencesService.unsubscribe(notification.userId, typeId, header);

    // Return HTML response for browser
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>Unsubscribed</title></head>
        <body>
          <h1>You have been unsubscribed</h1>
          <p>You will no longer receive these notifications.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to unsubscribe');
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default app;
