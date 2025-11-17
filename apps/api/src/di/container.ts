import { container } from '@crm/shared';
import { db, type Database } from '@crm/database';

// Feature imports
import { UserRepository } from '@crm/database';
import { UserService } from '../users/service';
import { IntegrationRepository } from '../integrations/repository';
import { IntegrationService } from '../integrations/service';
import { TenantRepository } from '../tenants/repository';
import { TenantService } from '../tenants/service';
import { EmailRepository } from '../emails/repository';
import { EmailThreadRepository } from '../emails/thread-repository';
import { EmailService } from '../emails/service';
import { RunRepository } from '../runs/repository';
import { RunService } from '../runs/service';

export function setupContainer() {
  // Register database
  container.register<Database>('Database', { useValue: db });

  // Register repositories
  container.register(UserRepository, { useClass: UserRepository });
  container.register(IntegrationRepository, { useClass: IntegrationRepository });
  container.register(TenantRepository, { useClass: TenantRepository });
  container.register(EmailRepository, { useClass: EmailRepository });
  container.register(EmailThreadRepository, { useClass: EmailThreadRepository });
  container.register(RunRepository, { useClass: RunRepository });

  // Register services
  container.register(UserService, { useClass: UserService });
  container.register(IntegrationService, { useClass: IntegrationService });
  container.register(TenantService, { useClass: TenantService });
  container.register(EmailService, { useClass: EmailService });
  container.register(RunService, { useClass: RunService });
}
