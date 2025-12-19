import { injectable, inject } from 'tsyringe';
import { AnalysisClient } from '@crm/clients';
import { EmailAnalysisRepository } from './analysis-repository';
import { EmailRepository } from './repository';
import { ThreadAnalysisService } from './thread-analysis-service';
import { createEmailAnalysisRecord } from './analysis-utils';
import type { Email, AnalysisType } from '@crm/shared';
import type { AnalysisType as EmailAnalysisType } from './analysis-schema';
import type { NewEmailParticipant } from './schema';
import { UserRepository } from '../users/repository';
import { ContactRepository } from '../contacts/repository';
import { ContactService, type SignatureData } from '../contacts/service';
import { logger } from '../utils/logger';

export interface AnalysisExecutionResult {
  domainResult?: {
    customers?: Array<{ id: string; domains: string[] }>;
  };
  contactResult?: {
    contacts?: Array<{ id: string; email: string; name?: string; customerId?: string }>;
  };
  analysisResults?: Record<string, any>; // Map of analysisType -> result
}

export interface AnalysisExecutionOptions {
  tenantId: string;
  emailId: string;
  email: Email;
  threadId: string; // Required for thread summary retrieval
  threadContext?: string; // Optional: if provided, use this instead of fetching summaries
  persist?: boolean; // Whether to save results to database
  analysisTypes?: AnalysisType[]; // Optional: which analyses to run (e.g., ['sentiment', 'escalation'])
  useThreadSummaries?: boolean; // Whether to use thread summaries as context (default: true)
}

/**
 * Email Analysis Service
 * Handles analysis execution for both batch (Inngest) and interactive (API) operations
 */
@injectable()
export class EmailAnalysisService {
  constructor(
    @inject(AnalysisClient) private analysisClient: AnalysisClient,
    private analysisRepo: EmailAnalysisRepository,
    private emailRepo: EmailRepository,
    private threadAnalysisService: ThreadAnalysisService,
    private userRepo: UserRepository,
    private contactRepo: ContactRepository,
    private contactService: ContactService
  ) { }

  /**
   * Execute full analysis pipeline for an email
   * Reusable for both Inngest (batch) and API (interactive) operations
   */
  async executeAnalysis(options: AnalysisExecutionOptions): Promise<AnalysisExecutionResult> {
    const {
      tenantId,
      emailId,
      email,
      threadId,
      threadContext: providedThreadContext,
      persist = false,
      analysisTypes,
      useThreadSummaries = true,
    } = options;
    const analysisServiceUrl = process.env.SERVICE_ANALYSIS_URL!;
    const pipelineStartTime = Date.now();

    // COST TRACKING LOG: Start of analysis pipeline
    logger.info(
      {
        tenantId,
        emailId,
        threadId,
        persist,
        analysisTypes: analysisTypes || 'default',
        pipelineStartTime,
        logType: 'ANALYSIS_PIPELINE_START',
      },
      'Analysis pipeline started'
    );

    // Get thread context (summaries or provided context)
    let threadContext: string | undefined;
    if (providedThreadContext) {
      // Use provided context (e.g., from API route that builds it from raw emails)
      threadContext = providedThreadContext;
      logger.debug(
        {
          tenantId,
          emailId,
          threadId,
          contextSource: 'provided',
          contextLength: threadContext.length,
        },
        'Using provided thread context'
      );
    } else if (useThreadSummaries) {
      // Fetch thread summaries and build context
      // If analyzing sentiment, prioritize thread sentiment summary
      const primaryAnalysisType = analysisTypes && analysisTypes.length > 0 ? analysisTypes[0] : undefined;
      try {
        const threadSummaryContext = await this.threadAnalysisService.getThreadContext(threadId, primaryAnalysisType);
        threadContext = threadSummaryContext.contextString;

        // Log sentiment-specific info if analyzing sentiment
        const sentimentSummary = threadSummaryContext.summaries.find((s) => s.analysisType === 'sentiment');
        logger.info(
          {
            tenantId,
            emailId,
            threadId,
            summariesCount: threadSummaryContext.summaries.length,
            analysisTypes: threadSummaryContext.summaries.map((s) => s.analysisType),
            contextLength: threadContext.length,
            hasSentimentSummary: !!sentimentSummary,
            primaryAnalysisType,
          },
          'Using thread summaries as context'
        );
      } catch (error: any) {
        logger.warn(
          {
            error: {
              message: error.message,
              stack: error.stack,
            },
            tenantId,
            emailId,
            threadId,
          },
          'Failed to fetch thread summaries, proceeding without thread context'
        );
        // Continue without thread context
      }
    }

    logger.info(
      {
        tenantId,
        emailId,
        persist,
        analysisServiceUrl,
      },
      'Starting email analysis execution'
    );

    const result: AnalysisExecutionResult = {};

    // Step 1: Domain extraction (always runs, saves to customers table)
    const domainExtractStartTime = Date.now();
    try {
      // COST TRACKING LOG: Domain extraction API call
      logger.warn(
        {
          tenantId,
          emailId,
          analysisServiceUrl,
          endpoint: '/api/analysis/domain-extract',
          apiCallStartTime: domainExtractStartTime,
          logType: 'LLM_API_CALL_START',
          apiCallType: 'domain-extraction',
        },
        'LLM API CALL: Starting domain extraction'
      );

      result.domainResult = await this.analysisClient.extractDomains(tenantId, email);

      const domainExtractEndTime = Date.now();
      logger.info(
        {
          tenantId,
          emailId,
          apiCallDurationMs: domainExtractEndTime - domainExtractStartTime,
          logType: 'LLM_API_CALL_COMPLETE',
          apiCallType: 'domain-extraction',
          customersCreated: result.domainResult?.customers?.length || 0,
        },
        'LLM API CALL: Domain extraction completed'
      );

      logger.info(
        {
          tenantId,
          emailId,
          customersCreated: result.domainResult?.customers?.length || 0,
          customers: result.domainResult?.customers?.map((c: any) => ({
            id: c.id,
            domains: c.domains,
          })),
        },
        'Domain extraction completed successfully'
      );
    } catch (domainError: any) {
      logger.error(
        {
          tenantId,
          emailId,
          error: {
            message: domainError.message,
            stack: domainError.stack,
            status: domainError.status,
            responseBody: domainError.responseBody,
          },
          analysisServiceUrl,
          endpoint: '/api/analysis/domain-extract',
        },
        'Domain extraction FAILED - customers not created'
      );
      throw domainError;
    }

    // Step 2: Contact extraction (always runs, saves to contacts table)
    const contactExtractStartTime = Date.now();
    try {
      // COST TRACKING LOG: Contact extraction API call
      logger.warn(
        {
          tenantId,
          emailId,
          analysisServiceUrl,
          endpoint: '/api/analysis/contact-extract',
          customersProvided: result.domainResult?.customers?.length || 0,
          apiCallStartTime: contactExtractStartTime,
          logType: 'LLM_API_CALL_START',
          apiCallType: 'contact-extraction',
        },
        'LLM API CALL: Starting contact extraction'
      );

      result.contactResult = await this.analysisClient.extractContacts(
        tenantId,
        email,
        result.domainResult?.customers
      );

      const contactExtractEndTime = Date.now();
      logger.info(
        {
          tenantId,
          emailId,
          apiCallDurationMs: contactExtractEndTime - contactExtractStartTime,
          logType: 'LLM_API_CALL_COMPLETE',
          apiCallType: 'contact-extraction',
          contactsCreated: result.contactResult?.contacts?.length || 0,
        },
        'LLM API CALL: Contact extraction completed'
      );

      logger.info(
        {
          tenantId,
          emailId,
          contactsCreated: result.contactResult?.contacts?.length || 0,
          contacts: result.contactResult?.contacts?.map((c: any) => ({
            id: c.id,
            email: c.email,
            name: c.name,
            customerId: c.customerId,
          })),
        },
        'Contact extraction completed successfully'
      );
    } catch (contactError: any) {
      logger.error(
        {
          tenantId,
          emailId,
          error: {
            message: contactError.message,
            stack: contactError.stack,
            status: contactError.status,
            responseBody: contactError.responseBody,
          },
          analysisServiceUrl,
          endpoint: '/api/analysis/contact-extract',
          domainExtractionSucceeded: !!result.domainResult,
        },
        'Contact extraction FAILED - contacts not created'
      );
      throw contactError;
    }

    // Step 2.5: Create email participants for access control
    // This links emails to customers via participants for efficient access queries
    if (persist) {
      try {
        await this.createEmailParticipants(
          tenantId,
          emailId,
          email,
          result.contactResult?.contacts || []
        );
      } catch (participantError: any) {
        // Log but don't fail - participants can be backfilled later
        logger.warn(
          {
            error: {
              message: participantError.message,
              stack: participantError.stack,
            },
            tenantId,
            emailId,
          },
          'Failed to create email participants (non-blocking)'
        );
      }
    }

    // Step 3: Other analyses (sentiment, escalation, etc.) - optional
    // THIS IS THE MOST EXPENSIVE LLM CALL
    const mainAnalysisStartTime = Date.now();
    try {
      // COST TRACKING LOG: Main analysis API call (sentiment, escalation, etc.)
      logger.warn(
        {
          tenantId,
          emailId,
          analysisServiceUrl,
          endpoint: '/api/analysis/analyze',
          hasThreadContext: !!threadContext,
          threadContextLength: threadContext?.length || 0,
          requestedAnalysisTypes: analysisTypes || 'default (sentiment, escalation, signature)',
          apiCallStartTime: mainAnalysisStartTime,
          logType: 'LLM_API_CALL_START',
          apiCallType: 'main-analysis',
        },
        'LLM API CALL: Starting MAIN analysis (sentiment, escalation) - HIGHEST COST'
      );

      const analysisResponse = await this.analysisClient.analyze(tenantId, email, {
        threadContext,
        analysisTypes, // Pass through to analysis service (or undefined to use defaults)
      });

      const mainAnalysisEndTime = Date.now();
      logger.warn(
        {
          tenantId,
          emailId,
          apiCallDurationMs: mainAnalysisEndTime - mainAnalysisStartTime,
          analysisTypesReturned: analysisResponse?.results ? Object.keys(analysisResponse.results) : [],
          logType: 'LLM_API_CALL_COMPLETE',
          apiCallType: 'main-analysis',
        },
        'LLM API CALL: MAIN analysis completed'
      );

      logger.debug(
        {
          tenantId,
          emailId,
          analysisResponseKeys: analysisResponse ? Object.keys(analysisResponse) : [],
          hasResults: !!analysisResponse?.results,
          resultsKeys: analysisResponse?.results ? Object.keys(analysisResponse.results) : [],
        },
        'Analysis response received'
      );

      // Analysis service returns: { success: true, data: { results: {...} } }
      // AnalysisClient.analyze() returns the data object directly (data.results)
      result.analysisResults = analysisResponse?.results || {};

      logger.info(
        {
          tenantId,
          emailId,
          analysisTypes: Object.keys(result.analysisResults || {}),
          analysisCount: Object.keys(result.analysisResults || {}).length,
          analysisTypesList: Object.keys(result.analysisResults || {}),
        },
        'Email analysis completed'
      );
    } catch (analysisError: any) {
      // Log but don't fail - other analyses are optional
      logger.warn(
        {
          error: {
            message: analysisError.message,
            stack: analysisError.stack,
            status: analysisError.status,
            responseBody: analysisError.responseBody,
          },
          tenantId,
          emailId,
          analysisServiceUrl,
          endpoint: '/api/analysis/analyze',
        },
        'Optional analyses failed (non-blocking)'
      );
      // Continue - domain and contact extraction succeeded
      result.analysisResults = {}; // Ensure it's set to empty object
    }

    // Step 4: Persist analysis results if requested
    if (persist && result.analysisResults && Object.keys(result.analysisResults).length > 0) {
      await this.persistAnalysisResults(tenantId, emailId, result.analysisResults);

      // Update email record with sentiment for fast querying
      const sentimentResult = result.analysisResults['sentiment'];
      if (sentimentResult && sentimentResult.value) {
        try {
          await this.emailRepo.updateSentiment(
            emailId,
            sentimentResult.value,
            sentimentResult.confidence || 0.5
          );
          logger.info(
            {
              tenantId,
              emailId,
              sentiment: sentimentResult.value,
              confidence: sentimentResult.confidence,
            },
            'Updated email sentiment fields'
          );
        } catch (error: any) {
          logger.error(
            {
              error: {
                message: error.message,
                stack: error.stack,
              },
              tenantId,
              emailId,
            },
            'Failed to update email sentiment (non-blocking)'
          );
          // Don't fail the analysis if this update fails
        }
      }
    }

    // Step 5: Ensure all email participants have contacts and customers
    // This runs in the API service as a safety net / supplement to analysis service extraction
    try {
      const ensuredContacts = await this.contactService.ensureContactsFromEmail(tenantId, email);

      // Update result.contactResult with the ensured contacts
      if (!result.contactResult) {
        result.contactResult = { contacts: [] };
      }
      if (!result.contactResult.contacts) {
        result.contactResult.contacts = [];
      }

      // Merge ensured contacts with existing contacts (avoid duplicates)
      const existingEmails = new Set(result.contactResult.contacts.map(c => c.email.toLowerCase()));
      for (const contact of ensuredContacts) {
        if (!existingEmails.has(contact.email.toLowerCase())) {
          result.contactResult.contacts.push({
            id: contact.id,
            email: contact.email,
            name: contact.name,
            customerId: contact.customerId,
          });
        }
      }
    } catch (error: any) {
      logger.warn(
        {
          error: {
            message: error.message,
            stack: error.stack,
          },
          tenantId,
          emailId,
        },
        'Failed to ensure contacts from email (non-blocking)'
      );
      // Don't fail the analysis if contact ensuring fails
    }

    // Step 6: Enrich contacts with signature data
    if (result.analysisResults && result.analysisResults['signature-extraction']) {
      try {
        await this.enrichContactsFromSignature(
          tenantId,
          emailId,
          email,
          result.analysisResults['signature-extraction'],
          result.contactResult?.contacts || []
        );
      } catch (error: any) {
        logger.warn(
          {
            error: {
              message: error.message,
              stack: error.stack,
            },
            tenantId,
            emailId,
          },
          'Failed to enrich contacts from signature (non-blocking)'
        );
        // Don't fail the analysis if signature enrichment fails
      }
    }

    // Step 7: Update thread summaries with new email analysis results
    if (persist && result.analysisResults && Object.keys(result.analysisResults).length > 0 && useThreadSummaries) {
      try {
        await this.threadAnalysisService.updateThreadSummaries(
          tenantId,
          threadId,
          emailId,
          email,
          result.analysisResults
        );
        logger.info(
          {
            tenantId,
            emailId,
            threadId,
            analysisTypes: Object.keys(result.analysisResults),
          },
          'Thread summaries updated'
        );
      } catch (error: any) {
        logger.error(
          {
            error: {
              message: error.message,
              stack: error.stack,
            },
            tenantId,
            emailId,
            threadId,
          },
          'Failed to update thread summaries (non-blocking)'
        );
        // Don't fail the entire analysis if summary update fails
      }
    }

    return result;
  }

  /**
   * Persist analysis results to database
   * Extracts fields and saves via repository
   */
  private async persistAnalysisResults(
    tenantId: string,
    emailId: string,
    analysisResults: Record<string, any>
  ): Promise<void> {
    const recordsToSave: any[] = [];

    logger.info(
      {
        tenantId,
        emailId,
        analysisTypes: Object.keys(analysisResults),
      },
      'Preparing to persist analysis results'
    );

    // Convert analysis results to database records
    for (const [analysisType, result] of Object.entries(analysisResults)) {
      try {
        // Create record with extracted fields
        const record = createEmailAnalysisRecord(
          emailId,
          tenantId,
          analysisType as EmailAnalysisType,
          result as any, // The actual result from analysis service
          {
            // Note: We don't have modelUsed/reasoning/usage from the API response
            // These would need to be added to the AnalysisClient response if needed
          }
        );

        recordsToSave.push(record);

        logger.debug(
          {
            tenantId,
            emailId,
            analysisType,
            hasConfidence: !!record.confidence,
            hasDetected: record.detected !== undefined,
            hasRiskLevel: !!record.riskLevel,
          },
          'Created analysis record'
        );
      } catch (error: any) {
        logger.error(
          {
            error: {
              message: error.message,
              stack: error.stack,
            },
            tenantId,
            emailId,
            analysisType,
            result,
          },
          'Failed to create analysis record'
        );
        // Continue with other analyses
      }
    }

    if (recordsToSave.length > 0) {
      await this.analysisRepo.upsertAnalyses(recordsToSave);
      logger.info(
        {
          tenantId,
          emailId,
          savedCount: recordsToSave.length,
          analysisTypes: recordsToSave.map((r) => r.analysisType),
        },
        'Analysis results persisted to database'
      );
    } else {
      logger.warn(
        {
          tenantId,
          emailId,
          analysisResultsCount: Object.keys(analysisResults).length,
        },
        'No analysis records created (all failed)'
      );
    }
  }

  /**
   * Create email participants for access control
   * Links emails to users/contacts with their customer context
   *
   * For each email address in from/to/cc/bcc:
   * 1. Check if it's a user (internal) - participantType = 'user'
   * 2. If not, check if it's a contact (external) - participantType = 'contact'
   * 3. If found, link to their customer for access control
   */
  private async createEmailParticipants(
    tenantId: string,
    emailId: string,
    email: Email,
    contacts: Array<{ id: string; email: string; name?: string; customerId?: string }>
  ): Promise<void> {
    // Collect all unique email addresses from the email
    const allEmailAddresses = new Set<string>();
    const emailDirections: Map<string, 'from' | 'to' | 'cc' | 'bcc'> = new Map();
    const emailNames: Map<string, string | undefined> = new Map();

    // From
    if (email.from?.email) {
      const fromEmail = email.from.email.toLowerCase();
      allEmailAddresses.add(fromEmail);
      emailDirections.set(fromEmail, 'from');
      emailNames.set(fromEmail, email.from.name);
    }

    // To
    for (const to of email.tos || []) {
      if (to.email) {
        const toEmail = to.email.toLowerCase();
        allEmailAddresses.add(toEmail);
        if (!emailDirections.has(toEmail)) {
          emailDirections.set(toEmail, 'to');
          emailNames.set(toEmail, to.name);
        }
      }
    }

    // CC
    for (const cc of email.ccs || []) {
      if (cc.email) {
        const ccEmail = cc.email.toLowerCase();
        allEmailAddresses.add(ccEmail);
        if (!emailDirections.has(ccEmail)) {
          emailDirections.set(ccEmail, 'cc');
          emailNames.set(ccEmail, cc.name);
        }
      }
    }

    // BCC
    for (const bcc of email.bccs || []) {
      if (bcc.email) {
        const bccEmail = bcc.email.toLowerCase();
        allEmailAddresses.add(bccEmail);
        if (!emailDirections.has(bccEmail)) {
          emailDirections.set(bccEmail, 'bcc');
          emailNames.set(bccEmail, bcc.name);
        }
      }
    }

    if (allEmailAddresses.size === 0) {
      logger.debug({ tenantId, emailId }, 'No email addresses found for participant creation');
      return;
    }

    // Batch lookup users and contacts
    const emailArray = Array.from(allEmailAddresses);
    const [usersMap, contactsMap] = await Promise.all([
      this.userRepo.findByEmails(tenantId, emailArray),
      this.contactRepo.findByEmails(tenantId, emailArray),
    ]);

    // Also build a map from the newly created contacts (they might not be in DB yet)
    const newContactsMap = new Map<string, { id: string; customerId?: string }>();
    for (const contact of contacts) {
      newContactsMap.set(contact.email.toLowerCase(), {
        id: contact.id,
        customerId: contact.customerId,
      });
    }

    // Build participant records
    const participants: NewEmailParticipant[] = [];

    for (const emailAddr of allEmailAddresses) {
      const direction = emailDirections.get(emailAddr) || 'to';
      const name = emailNames.get(emailAddr);

      // Check if user (internal)
      const user = usersMap.get(emailAddr);
      if (user) {
        participants.push({
          emailId,
          participantType: 'user',
          participantId: user.id,
          email: emailAddr,
          name: name || `${user.firstName} ${user.lastName}`.trim(),
          direction,
          customerId: null, // Users don't have direct customer context
        });
        continue;
      }

      // Check if contact (external)
      // First check newly created contacts, then DB contacts
      const newContact = newContactsMap.get(emailAddr);
      const dbContact = contactsMap.get(emailAddr);
      const contact = newContact || (dbContact ? { id: dbContact.id, customerId: dbContact.customerId || undefined } : null);

      if (contact) {
        participants.push({
          emailId,
          participantType: 'contact',
          participantId: contact.id,
          email: emailAddr,
          name: name || dbContact?.name || undefined,
          direction,
          customerId: contact.customerId || null,
        });
        continue;
      }

      // Unknown participant - still create record for tracking
      // This happens when email is from/to someone not yet in our system
      logger.debug(
        { tenantId, emailId, email: emailAddr, direction },
        'Unknown participant - email address not found in users or contacts'
      );
      // Skip unknown participants for now - they'll be added when contacts are created
    }

    if (participants.length > 0) {
      await this.emailRepo.createParticipants(participants);
      logger.info(
        {
          tenantId,
          emailId,
          participantsCreated: participants.length,
          users: participants.filter(p => p.participantType === 'user').length,
          contacts: participants.filter(p => p.participantType === 'contact').length,
          withCustomer: participants.filter(p => p.customerId).length,
        },
        'Created email participants'
      );
    }
  }

  /**
   * Enrich contacts with extracted signature data
   * Delegates to ContactService for the actual enrichment logic
   */
  private async enrichContactsFromSignature(
    tenantId: string,
    emailId: string,
    email: Email,
    signatureData: SignatureData,
    existingContacts: Array<{ id: string; email: string; name?: string; customerId?: string }>
  ): Promise<void> {
    await this.contactService.enrichFromSignature(
      tenantId,
      emailId,
      email,
      signatureData,
      existingContacts
    );
  }
}
