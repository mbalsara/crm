import { injectable, inject } from 'tsyringe';
import { z } from 'zod';
import { ContactRepository } from './repository';
import { CustomerRepository } from '../customers/repository';
import { logger } from '../utils/logger';
import type { Contact, NewContact } from './schema';
import type { Email } from '@crm/shared';

/**
 * Personal email providers to exclude from customer creation
 * Contacts from these domains are created but not linked to customers
 */
const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'email.com',
]);

/**
 * Signature data extracted from email signatures
 */
export const signatureDataSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
  linkedin: z.string().optional(),
  x: z.string().optional(),
  linktree: z.string().optional(),
});

export type SignatureData = z.infer<typeof signatureDataSchema>;

/**
 * Result of signature enrichment operation
 */
export const signatureEnrichmentResultSchema = z.object({
  contactId: z.string().uuid(),
  created: z.boolean(),
  enriched: z.boolean(),
  fieldsUpdated: z.array(z.string()),
});

export type SignatureEnrichmentResult = z.infer<typeof signatureEnrichmentResultSchema>;

@injectable()
export class ContactService {
  constructor(
    @inject(ContactRepository) private contactRepository: ContactRepository,
    @inject(CustomerRepository) private customerRepository: CustomerRepository
  ) {}

  async getContactByEmail(tenantId: string, email: string): Promise<Contact | undefined> {
    try {
      logger.info({ email, tenantId }, 'Fetching contact by email');
      return await this.contactRepository.findByEmail(tenantId, email);
    } catch (error: any) {
      logger.error({ error, email, tenantId }, 'Failed to fetch contact by email');
      throw error;
    }
  }

  async getContactById(id: string): Promise<Contact | undefined> {
    try {
      logger.info({ id }, 'Fetching contact by id');
      return await this.contactRepository.findById(id);
    } catch (error: any) {
      logger.error({ error, id }, 'Failed to fetch contact by id');
      throw error;
    }
  }

  async getContactsByTenant(tenantId: string): Promise<Contact[]> {
    try {
      logger.info({ tenantId }, 'Fetching contacts by tenant');
      return await this.contactRepository.findByTenantId(tenantId);
    } catch (error: any) {
      logger.error({ error, tenantId }, 'Failed to fetch contacts by tenant');
      throw error;
    }
  }

  async getContactsByCustomer(customerId: string): Promise<Contact[]> {
    try {
      logger.info({ customerId }, 'Fetching contacts by customer');
      return await this.contactRepository.findByCustomerId(customerId);
    } catch (error: any) {
      logger.error({ error, customerId }, 'Failed to fetch contacts by customer');
      throw error;
    }
  }

  async createContact(data: NewContact): Promise<Contact> {
    try {
      logger.info({ email: data.email, tenantId: data.tenantId }, 'Creating contact');
      return await this.contactRepository.create(data);
    } catch (error: any) {
      logger.error({ error, email: data.email, tenantId: data.tenantId }, 'Failed to create contact');
      throw error;
    }
  }

  async upsertContact(data: NewContact): Promise<Contact> {
    try {
      logger.info({ email: data.email, tenantId: data.tenantId }, 'Upserting contact');
      return await this.contactRepository.upsert(data);
    } catch (error: any) {
      logger.error({ error, email: data.email, tenantId: data.tenantId }, 'Failed to upsert contact');
      throw error;
    }
  }

  async updateContact(id: string, data: Partial<NewContact>): Promise<Contact | undefined> {
    try {
      logger.info({ id }, 'Updating contact');
      return await this.contactRepository.update(id, data);
    } catch (error: any) {
      logger.error({ error, id }, 'Failed to update contact');
      throw error;
    }
  }

  /**
   * Enrich contacts with extracted signature data
   * - Updates existing contacts with missing fields from signature
   * - Creates new contacts if they don't exist but we have signature data
   *
   * @param tenantId - Tenant ID
   * @param emailId - Email ID (for logging)
   * @param email - The email object containing sender info
   * @param signatureData - Extracted signature data
   * @param existingContacts - Contacts already extracted from this email
   * @returns Result of enrichment or null if no enrichment was needed
   */
  async enrichFromSignature(
    tenantId: string,
    emailId: string,
    email: Email,
    signatureData: SignatureData,
    existingContacts: Array<{ id: string; email: string; name?: string; customerId?: string }>
  ): Promise<SignatureEnrichmentResult | null> {
    // The signature belongs to the sender of the email
    const senderEmail = email.from?.email?.toLowerCase();
    if (!senderEmail) {
      logger.debug({ emailId }, 'No sender email, skipping signature enrichment');
      return null;
    }

    // Check if we have any meaningful signature data to apply
    const hasSignatureData = Object.entries(signatureData).some(([key, value]) => {
      if (key === 'email' || key === 'company') return false; // Skip email and company for this check
      return value && typeof value === 'string' && value.trim().length > 0;
    });

    if (!hasSignatureData) {
      logger.debug(
        { emailId, senderEmail },
        'No meaningful signature data extracted, skipping enrichment'
      );
      return null;
    }

    // Find the contact for the sender
    let contact = existingContacts.find(c => c.email.toLowerCase() === senderEmail);
    let contactId = contact?.id;

    // If contact doesn't exist in the provided list, try to find it in the database
    if (!contactId) {
      const dbContact = await this.contactRepository.findByEmail(tenantId, senderEmail);
      contactId = dbContact?.id;
    }

    // If contact still doesn't exist but we have signature data, create a new contact
    if (!contactId) {
      logger.info(
        {
          tenantId,
          emailId,
          senderEmail,
          signatureName: signatureData.name,
          signatureTitle: signatureData.title,
          logType: 'SIGNATURE_CONTACT_CREATE',
        },
        'SIGNATURE ENRICHMENT: Creating new contact from signature data'
      );

      // Try to find a customer to associate with this contact
      // Use an existing contact's customerId if available
      let customerId: string | undefined;
      const contactWithCustomer = existingContacts.find(c => c.customerId);
      if (contactWithCustomer) {
        customerId = contactWithCustomer.customerId;
      }

      try {
        const newContact = await this.contactRepository.create({
          tenantId,
          email: senderEmail,
          name: signatureData.name || email.from?.name,
          title: signatureData.title,
          phone: signatureData.phone,
          mobile: signatureData.mobile,
          address: signatureData.address,
          website: signatureData.website,
          linkedin: signatureData.linkedin,
          x: signatureData.x,
          linktree: signatureData.linktree,
          customerId: customerId || null,
        });

        const fieldsSet = Object.entries(signatureData)
          .filter(([k, v]) => v && k !== 'email' && k !== 'company')
          .map(([k]) => k);

        logger.info(
          {
            tenantId,
            emailId,
            contactId: newContact.id,
            senderEmail,
            customerId,
            fieldsSet,
            logType: 'SIGNATURE_CONTACT_CREATED',
          },
          'SIGNATURE ENRICHMENT: New contact created from signature'
        );

        return {
          contactId: newContact.id,
          created: true,
          enriched: false,
          fieldsUpdated: fieldsSet,
        };
      } catch (createError: any) {
        // Contact might have been created by another process, try to find it again
        if (createError.code === '23505') { // Unique violation
          const dbContact = await this.contactRepository.findByEmail(tenantId, senderEmail);
          contactId = dbContact?.id;
          if (!contactId) {
            throw createError;
          }
        } else {
          throw createError;
        }
      }
    }

    // Enrich existing contact with signature data
    const enrichResult = await this.contactRepository.enrichFromSignature(contactId, signatureData);

    if (enrichResult.updated) {
      logger.info(
        {
          tenantId,
          emailId,
          contactId,
          senderEmail,
          fieldsUpdated: enrichResult.fieldsUpdated,
          signatureData: Object.fromEntries(
            enrichResult.fieldsUpdated.map(field => [field, signatureData[field as keyof SignatureData]])
          ),
          logType: 'SIGNATURE_CONTACT_ENRICHED',
        },
        'SIGNATURE ENRICHMENT: Contact enriched with signature data'
      );

      return {
        contactId,
        created: false,
        enriched: true,
        fieldsUpdated: enrichResult.fieldsUpdated,
      };
    }

    logger.debug(
      {
        tenantId,
        emailId,
        contactId,
        senderEmail,
      },
      'Contact already has all signature fields, no enrichment needed'
    );

    return {
      contactId,
      created: false,
      enriched: false,
      fieldsUpdated: [],
    };
  }

  /**
   * Ensure contacts exist for all email participants (from, to, cc, bcc)
   * - Creates customers from domains if they don't exist (excluding personal email domains)
   * - Creates contacts for all participants and links them to customers
   *
   * @param tenantId - Tenant ID
   * @param email - The email object containing all participants
   * @returns Array of created/existing contacts with their customer associations
   */
  async ensureContactsFromEmail(
    tenantId: string,
    email: Email
  ): Promise<Array<{ id: string; email: string; name?: string; customerId?: string; created: boolean }>> {
    const results: Array<{ id: string; email: string; name?: string; customerId?: string; created: boolean }> = [];

    // Collect all unique email addresses from the email
    const participants = new Map<string, { email: string; name?: string }>();

    // From sender
    if (email.from?.email) {
      participants.set(email.from.email.toLowerCase(), {
        email: email.from.email,
        name: email.from.name,
      });
    }

    // To recipients
    for (const addr of email.tos || []) {
      if (addr.email && !participants.has(addr.email.toLowerCase())) {
        participants.set(addr.email.toLowerCase(), {
          email: addr.email,
          name: addr.name,
        });
      }
    }

    // CC recipients
    for (const addr of email.ccs || []) {
      if (addr.email && !participants.has(addr.email.toLowerCase())) {
        participants.set(addr.email.toLowerCase(), {
          email: addr.email,
          name: addr.name,
        });
      }
    }

    // BCC recipients
    for (const addr of email.bccs || []) {
      if (addr.email && !participants.has(addr.email.toLowerCase())) {
        participants.set(addr.email.toLowerCase(), {
          email: addr.email,
          name: addr.name,
        });
      }
    }

    logger.info(
      {
        tenantId,
        emailId: email.messageId,
        participantsCount: participants.size,
        logType: 'CONTACT_ENSURE_START',
      },
      'CONTACT CREATION: Ensuring contacts for all email participants'
    );

    // Process each participant
    for (const [emailLower, participant] of participants) {
      try {
        // Extract domain from email
        const domain = this.extractDomain(participant.email);
        let customerId: string | undefined;

        // Find or create customer for this domain (if not a personal email domain)
        if (domain && !PERSONAL_DOMAINS.has(domain)) {
          try {
            // First try to find existing customer
            let customer = await this.customerRepository.findByDomain(tenantId, domain);

            if (!customer) {
              // Create new customer for this domain
              const inferredName = this.inferCustomerName(domain);
              customer = await this.customerRepository.create({
                tenantId,
                name: inferredName,
                domain,
              });

              logger.info(
                {
                  tenantId,
                  customerId: customer.id,
                  domain,
                  inferredName,
                  logType: 'CUSTOMER_CREATED_FROM_EMAIL',
                },
                'CUSTOMER CREATION: Created new customer from email participant domain'
              );
            }

            customerId = customer.id;
          } catch (customerError: any) {
            // If customer creation fails (e.g., unique constraint), try to find it again
            if (customerError.code === '23505') {
              const existingCustomer = await this.customerRepository.findByDomain(tenantId, domain);
              customerId = existingCustomer?.id;
            } else {
              logger.warn(
                {
                  tenantId,
                  domain,
                  error: customerError.message,
                },
                'Failed to create customer for domain, contact will be created without customer link'
              );
            }
          }
        }

        // Check if contact already exists
        let contact = await this.contactRepository.findByEmail(tenantId, emailLower);
        let created = false;

        if (!contact) {
          // Create new contact
          contact = await this.contactRepository.create({
            tenantId,
            email: participant.email,
            name: participant.name,
            customerId: customerId || null,
          });
          created = true;

          logger.info(
            {
              tenantId,
              contactId: contact.id,
              email: participant.email,
              name: participant.name,
              customerId,
              logType: 'CONTACT_CREATED_FROM_EMAIL',
            },
            'CONTACT CREATION: Created new contact from email participant'
          );
        } else if (!contact.customerId && customerId) {
          // Update existing contact with customer ID if it doesn't have one
          contact = await this.contactRepository.update(contact.id, { customerId }) || contact;

          logger.info(
            {
              tenantId,
              contactId: contact.id,
              email: participant.email,
              customerId,
              logType: 'CONTACT_LINKED_TO_CUSTOMER',
            },
            'CONTACT CREATION: Linked existing contact to customer'
          );
        }

        results.push({
          id: contact.id,
          email: contact.email,
          name: contact.name || undefined,
          customerId: contact.customerId || undefined,
          created,
        });
      } catch (error: any) {
        logger.error(
          {
            tenantId,
            email: participant.email,
            error: error.message,
          },
          'Failed to ensure contact for email participant'
        );
        // Continue with other participants
      }
    }

    logger.info(
      {
        tenantId,
        emailId: email.messageId,
        totalParticipants: participants.size,
        contactsCreated: results.filter(r => r.created).length,
        contactsExisting: results.filter(r => !r.created).length,
        logType: 'CONTACT_ENSURE_COMPLETE',
      },
      'CONTACT CREATION: Completed ensuring contacts for all email participants'
    );

    return results;
  }

  /**
   * Extract top-level domain from email address
   */
  private extractDomain(email: string): string | null {
    try {
      const domain = email.split('@')[1]?.toLowerCase();
      if (!domain) return null;

      // Extract top-level domain (e.g., subdomain.example.com -> example.com)
      const parts = domain.split('.');
      if (parts.length >= 2) {
        return parts.slice(-2).join('.');
      }
      return domain;
    } catch {
      return null;
    }
  }

  /**
   * Infer customer name from domain
   * Simple approach: "acme.com" -> "Acme"
   */
  private inferCustomerName(domain: string): string {
    const namePart = domain.split('.')[0];
    return namePart
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
