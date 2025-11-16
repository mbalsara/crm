import { Inngest, EventSchemas } from 'inngest';
import { logger } from '../utils/logger';

// Define event types
export type Events = {
  'gmail/sync.requested': {
    data: {
      tenantId: string;
      syncType: 'initial' | 'incremental' | 'historical' | 'webhook';
      startDate?: string;
      endDate?: string;
    };
  };
  'gmail/webhook.received': {
    data: {
      tenantId: string;
      historyId: string;
      emailAddress: string;
    };
  };
  'gmail/sync.historical': {
    data: {
      tenantId: string;
      startDate: string;
      endDate: string;
    };
  };
};

export const inngest = new Inngest({
  id: 'gmail-sync',
  schemas: new EventSchemas().fromRecord<Events>(),
  logger: logger,
});
