import { Context, Next } from 'hono';
import type { RequestHeader } from '@crm/shared';

// Hardcoded values until we implement authentication
const HARDCODED_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const HARDCODED_USER_ID = '00000000-0000-0000-0000-000000000000';

export async function requestHeaderMiddleware(c: Context, next: Next) {
  const requestHeader: RequestHeader = {
    tenantId: HARDCODED_TENANT_ID,
    userId: HARDCODED_USER_ID,
  };

  // Attach to context
  c.set('requestHeader', requestHeader);

  await next();
}
