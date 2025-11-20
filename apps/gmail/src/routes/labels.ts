import { Hono } from 'hono';
import { container } from '@crm/shared';
import { GmailService } from '../services/gmail';
import { logger } from '../utils/logger';
import { z } from 'zod';

const app = new Hono();

/**
 * Request schema for label operations
 */
const labelOperationSchema = z.object({
  tenantId: z.string().uuid(),
  messageId: z.string().min(1),
  labelIds: z.array(z.string().min(1)).min(1),
});

type LabelOperationRequest = z.infer<typeof labelOperationSchema>;

/**
 * Add labels to an email
 * POST /api/gmail/labels/add
 */
app.post('/add', async (c) => {
  try {
    const body = await c.req.json();
    
    // Validate request body
    const validated = labelOperationSchema.parse(body);
    const { tenantId, messageId, labelIds } = validated;

    logger.info(
      {
        tenantId,
        messageId,
        labelIds,
      },
      'Adding labels to email'
    );

    const gmailService = container.resolve(GmailService);
    const result = await gmailService.addLabels(tenantId, messageId, labelIds);

    logger.info(
      {
        tenantId,
        messageId,
        addedLabelIds: labelIds,
        currentLabelIds: result.labelIds,
      },
      'Labels added successfully'
    );

    return c.json({
      success: true,
      messageId,
      labelIds: result.labelIds,
      message: `Added ${labelIds.length} label(s) to email`,
    });
  } catch (error: any) {
    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      logger.error(
        {
          errors: error.errors,
          body: await c.req.json().catch(() => ({})),
        },
        'Invalid label operation request'
      );
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }

    logger.error(
      {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      },
      'Failed to add labels'
    );

    return c.json({ error: error.message || 'Failed to add labels' }, 500);
  }
});

/**
 * Remove labels from an email
 * DELETE /api/gmail/labels/remove
 */
app.delete('/remove', async (c) => {
  try {
    const body = await c.req.json();
    
    // Validate request body
    const validated = labelOperationSchema.parse(body);
    const { tenantId, messageId, labelIds } = validated;

    logger.info(
      {
        tenantId,
        messageId,
        labelIds,
      },
      'Removing labels from email'
    );

    const gmailService = container.resolve(GmailService);
    const result = await gmailService.removeLabels(tenantId, messageId, labelIds);

    logger.info(
      {
        tenantId,
        messageId,
        removedLabelIds: labelIds,
        currentLabelIds: result.labelIds,
      },
      'Labels removed successfully'
    );

    return c.json({
      success: true,
      messageId,
      labelIds: result.labelIds,
      message: `Removed ${labelIds.length} label(s) from email`,
    });
  } catch (error: any) {
    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      logger.error(
        {
          errors: error.errors,
          body: await c.req.json().catch(() => ({})),
        },
        'Invalid label operation request'
      );
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }

    logger.error(
      {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      },
      'Failed to remove labels'
    );

    return c.json({ error: error.message || 'Failed to remove labels' }, 500);
  }
});


export default app;
