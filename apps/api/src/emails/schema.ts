// API-specific schema exports - only expose what API needs
// This prevents other apps from importing schemas they shouldn't use

import type { Database } from '@crm/database';
import { emails, emailThreads } from '@crm/database';

// Re-export only the email-related types and tables
export type { Email, NewEmail } from '@crm/database';
export type { EmailThread, NewEmailThread } from '@crm/database';
export type { Database };

// Re-export only the email-related tables
export { emails, emailThreads };
