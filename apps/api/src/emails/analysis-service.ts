import { injectable, inject } from '@crm/shared';
import { AnalysisClient } from '@crm/clients';
import { EmailAnalysisRepository } from './analysis-repository';
import { createEmailAnalysisRecord } from './analysis-utils';
import type { Email, AnalysisType } from '@crm/shared';
import type { AnalysisType as EmailAnalysisType } from './analysis-schema';
import { logger } from '../utils/logger';

export interface AnalysisExecutionResult {
  domainResult?: {
    companies?: Array<{ id: string; domains: string[] }>;
  };
  contactResult?: {
    contacts?: Array<{ id: string; email: string; name?: string; companyId?: string }>;
  };
  analysisResults?: Record<string, any>; // Map of analysisType -> result
}

export interface AnalysisExecutionOptions {
  tenantId: string;
  emailId: string;
  email: Email;
  threadContext?: string;
  persist?: boolean; // Whether to save results to database
  analysisTypes?: AnalysisType[]; // Optional: which analyses to run (e.g., ['sentiment', 'escalation'])
}

/**
 * Email Analysis Service
 * Handles analysis execution for both batch (Inngest) and interactive (API) operations
 */
@injectable()
export class EmailAnalysisService {
  constructor(
    @inject(AnalysisClient) private analysisClient: AnalysisClient,
    private analysisRepo: EmailAnalysisRepository
  ) {}

  /**
   * Execute full analysis pipeline for an email
   * Reusable for both Inngest (batch) and API (interactive) operations
   */
  async executeAnalysis(options: AnalysisExecutionOptions): Promise<AnalysisExecutionResult> {
    const { tenantId, emailId, email, threadContext, persist = false, analysisTypes } = options;
    const analysisServiceUrl = process.env.ANALYSIS_API_URL || process.env.ANALYSIS_BASE_URL || 'http://localhost:4002';

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

    // Step 1: Domain extraction (always runs, saves to companies table)
    try {
      logger.info(
        {
          tenantId,
          emailId,
          analysisServiceUrl,
          endpoint: '/api/analysis/domain-extract',
        },
        'Calling domain extraction'
      );

      result.domainResult = await this.analysisClient.extractDomains(tenantId, email);

      logger.info(
        {
          tenantId,
          emailId,
          companiesCreated: result.domainResult?.companies?.length || 0,
          companies: result.domainResult?.companies?.map((c: any) => ({
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
        'Domain extraction FAILED - companies not created'
      );
      throw domainError;
    }

    // Step 2: Contact extraction (always runs, saves to contacts table)
    try {
      logger.info(
        {
          tenantId,
          emailId,
          analysisServiceUrl,
          endpoint: '/api/analysis/contact-extract',
          companiesProvided: result.domainResult?.companies?.length || 0,
        },
        'Calling contact extraction'
      );

      result.contactResult = await this.analysisClient.extractContacts(
        tenantId,
        email,
        result.domainResult?.companies
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
            companyId: c.companyId,
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

    // Step 3: Other analyses (sentiment, escalation, etc.) - optional
    try {
      logger.info(
        {
          tenantId,
          emailId,
          analysisServiceUrl,
          endpoint: '/api/analysis/analyze',
          hasThreadContext: !!threadContext,
          threadContextLength: threadContext?.length || 0,
        },
        'Calling email analysis (sentiment, escalation, etc.)'
      );

      const analysisResponse = await this.analysisClient.analyze(tenantId, email, {
        threadContext,
        analysisTypes, // Pass through to analysis service (or undefined to use defaults)
      });

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
}
