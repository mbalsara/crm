import { injectable } from '@crm/shared';
import { gmail_v1 } from 'googleapis';
import type { NewEmail } from '@crm/database';

interface ParsedEmail {
  subject: string;
  fromEmail: string;
  fromName?: string;
  tos: Array<{ email: string; name?: string }>;
  ccs: Array<{ email: string; name?: string }>;
  bccs: Array<{ email: string; name?: string }>;
  body: string;
  priority: string;
  receivedAt: Date;
  labels: string[];
}

@injectable()
export class EmailParserService {
  /**
   * Parse Gmail message to our email schema
   */
  parseMessage(message: gmail_v1.Schema$Message, tenantId: string): NewEmail {
    const headers = this.getHeaders(message);
    const parsed = this.parseHeaders(headers);

    return {
      tenantId,
      gmailMessageId: message.id!,
      gmailThreadId: message.threadId!,
      subject: parsed.subject,
      fromEmail: parsed.fromEmail,
      fromName: parsed.fromName,
      tos: parsed.tos,
      ccs: parsed.ccs,
      bccs: parsed.bccs,
      body: this.extractBody(message),
      priority: parsed.priority,
      labels: message.labelIds || [],
      receivedAt: parsed.receivedAt,
    };
  }

  private getHeaders(message: gmail_v1.Schema$Message): Map<string, string> {
    const headers = new Map<string, string>();

    if (message.payload?.headers) {
      for (const header of message.payload.headers) {
        if (header.name && header.value) {
          headers.set(header.name.toLowerCase(), header.value);
        }
      }
    }

    return headers;
  }

  private parseHeaders(headers: Map<string, string>): ParsedEmail {
    const subject = headers.get('subject') || '(No Subject)';
    const from = this.parseAddress(headers.get('from') || '');
    const tos = this.parseAddressList(headers.get('to') || '');
    const ccs = this.parseAddressList(headers.get('cc') || '');
    const bccs = this.parseAddressList(headers.get('bcc') || '');
    const date = headers.get('date');
    const priority = this.parsePriority(headers);

    return {
      subject,
      fromEmail: from.email,
      fromName: from.name,
      tos,
      ccs,
      bccs,
      body: '', // Will be filled by extractBody
      priority,
      receivedAt: date ? new Date(date) : new Date(),
      labels: [],
    };
  }

  private parseAddress(address: string): { email: string; name?: string } {
    // Format can be: "Name <email@example.com>" or just "email@example.com"
    const match = address.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/);

    if (match) {
      const name = match[1]?.trim();
      const email = match[2]?.trim();
      return { email, name: name || undefined };
    }

    return { email: address.trim() };
  }

  private parseAddressList(addresses: string): Array<{ email: string; name?: string }> {
    if (!addresses) return [];

    // Split by comma, but not commas within quotes
    const parts = addresses.match(/(?:[^,"]|"(?:\\.|[^"])*")+/g) || [];

    return parts.map((part) => this.parseAddress(part.trim())).filter((addr) => addr.email);
  }

  private parsePriority(headers: Map<string, string>): string {
    const priority = headers.get('x-priority') || headers.get('priority') || headers.get('importance');

    if (!priority) return 'normal';

    const priorityLower = priority.toLowerCase();

    if (priorityLower.includes('high') || priorityLower === '1' || priorityLower === '2') {
      return 'high';
    }

    if (priorityLower.includes('low') || priorityLower === '4' || priorityLower === '5') {
      return 'low';
    }

    return 'normal';
  }

  private extractBody(message: gmail_v1.Schema$Message): string {
    // Prefer HTML, fallback to plain text
    const htmlBody = this.extractBodyPart(message.payload, 'text/html');
    if (htmlBody) return htmlBody;

    const textBody = this.extractBodyPart(message.payload, 'text/plain');
    if (textBody) return textBody;

    return '';
  }

  private extractBodyPart(
    part: gmail_v1.Schema$MessagePart | undefined,
    mimeType: string
  ): string | null {
    if (!part) return null;

    // Check if this part matches the mimeType
    if (part.mimeType === mimeType && part.body?.data) {
      return this.decodeBase64(part.body.data);
    }

    // Recursively search in parts
    if (part.parts) {
      for (const subPart of part.parts) {
        const result = this.extractBodyPart(subPart, mimeType);
        if (result) return result;
      }
    }

    return null;
  }

  private decodeBase64(data: string): string {
    try {
      // Gmail uses URL-safe base64
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(base64, 'base64').toString('utf-8');
    } catch (error: any) {
      // Note: We don't have logger instance here, and this is a low-level parsing error
      // that shouldn't normally happen. Just log to console for now.
      console.error('Failed to decode base64:', {
        error: error.message,
        dataLength: data?.length,
      });
      return '';
    }
  }
}
