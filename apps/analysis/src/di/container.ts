import { container } from '@crm/shared';
import { logger } from '../utils/logger';
import { DomainExtractionService } from '../services/domain-extraction';
import { ContactExtractionService } from '../services/contact-extraction';
import { DomainEnrichmentService } from '../services/domain-enrichment';
import { CompanyClient, ContactClient } from '@crm/clients';

export function setupContainer() {
  logger.info('Analysis service container setup');
  
  // Register clients
  container.register(CompanyClient, { useClass: CompanyClient });
  container.register(ContactClient, { useClass: ContactClient });
  
  // Register services
  // DomainEnrichmentService is registered but not used yet - will be enabled when customer opts in
  container.register(DomainEnrichmentService, { useClass: DomainEnrichmentService });
  container.register(DomainExtractionService, { useClass: DomainExtractionService });
  container.register(ContactExtractionService, { useClass: ContactExtractionService });
  
  logger.info('Analysis service container setup complete');
}
