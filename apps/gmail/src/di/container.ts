import 'reflect-metadata';
import { container } from '@crm/shared';
import {
  IntegrationClient,
  TenantClient,
  RunClient,
  EmailClient,
} from '@crm/clients';

// Services
import { GmailClientFactory } from '../services/gmail-client-factory';
import { GmailService } from '../services/gmail';
import { EmailParserService } from '../services/email-parser';
import { SyncService } from '../services/sync';

export function setupContainer() {
  // Register API clients
  container.register(IntegrationClient, { useClass: IntegrationClient });
  container.register(TenantClient, { useClass: TenantClient });
  container.register(RunClient, { useClass: RunClient });
  container.register(EmailClient, { useClass: EmailClient });

  // Register services
  container.register(GmailClientFactory, { useClass: GmailClientFactory });
  container.register(GmailService, { useClass: GmailService });
  container.register(EmailParserService, { useClass: EmailParserService });
  container.register(SyncService, { useClass: SyncService });
}
