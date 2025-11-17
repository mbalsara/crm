import 'reflect-metadata';
import { container } from '@crm/shared';
import { logger } from '../utils/logger';

// Import classes to ensure they're loaded and decorators are evaluated
import { DomainExtractionService } from '../services/domain-extraction';
import { ContactExtractionService } from '../services/contact-extraction';
import { DomainEnrichmentService } from '../services/domain-enrichment';
import { AIService } from '../services/ai-service';
import { CompanyClient, ContactClient } from '@crm/clients';

export function setupContainer() {
  logger.info('Analysis service container setup');
  
  try {
    // Register dependencies first (clients)
    container.register(CompanyClient, { useClass: CompanyClient });
    container.register(ContactClient, { useClass: ContactClient });
    
    // Then register services that depend on clients
    container.register(DomainEnrichmentService, { useClass: DomainEnrichmentService });
    container.register(DomainExtractionService, { useClass: DomainExtractionService });
    container.register(ContactExtractionService, { useClass: ContactExtractionService });
    container.register(AIService, { useClass: AIService });
    
    logger.info('Analysis service container setup complete');
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to setup container');
    throw error;
  }
}
