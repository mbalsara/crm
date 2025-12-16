/**
 * Frontend-specific types that map to/from API types
 * These types are used by the UI components
 */

import { formatDistanceToNow } from 'date-fns';
import type { UserResponse, Company as ApiCompany, Contact as ApiContact } from '@crm/clients';

/**
 * User type for UI components
 * Maps from UserResponse
 */
export interface User {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role?: string;
  department?: string;
  avatar?: string;
  reportsTo: string[]; // Array of user IDs (managers)
  assignedCompanies: string[]; // Array of company IDs
  status: 'Active' | 'Inactive' | 'On Leave';
  joinedDate?: string;
  tenantId: string;
}

/**
 * Map UserResponse to User
 */
export function mapUserToUser(user: UserResponse): User {
  // Map rowStatus to status string
  // 0=active, 1=inactive, 2=archived
  const statusMap: Record<number, User['status']> = {
    0: 'Active',
    1: 'Inactive',
    2: 'Inactive', // archived treated as inactive
  };

  return {
    id: user.id,
    name: `${user.firstName} ${user.lastName}`,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: undefined, // TODO: Add role field to user API
    department: undefined, // TODO: Add department field to user API
    avatar: undefined,
    reportsTo: [], // TODO: Load from user relations
    assignedCompanies: [], // TODO: Load from user relations
    status: statusMap[user.rowStatus] || 'Inactive',
    joinedDate: typeof user.createdAt === 'string' ? user.createdAt : user.createdAt.toISOString(),
    tenantId: user.tenantId,
  };
}

/**
 * @deprecated Use User and mapUserToUser instead
 * Kept for backwards compatibility during migration
 */
export type Employee = User;
export const mapUserToEmployee = mapUserToUser;

/**
 * Company type for UI components
 * Extended from ApiCompany with additional computed fields
 */
export interface Company {
  id: string;
  name: string;
  domains: string[];
  tier: 'Premier' | 'Standard' | 'Basic';
  labels: string[];
  totalEmails: number;
  avgTAT: string;
  escalations: number;
  lastContact: string;
  sentiment: 'Positive' | 'Negative' | 'Neutral';
  churnRisk: 'Low' | 'Medium' | 'High';
  engagement: 'Retainer' | 'Time & Material' | 'Project';
  contacts: Contact[];
  emails: Email[];
  tenantId: string;
  website?: string;
  industry?: string;
  metadata?: Record<string, any>;
}

/**
 * Format a date as a relative time string (e.g., "2 days ago", "about 1 month ago")
 */
function formatRelativeDate(date: Date | undefined): string {
  if (!date) return '—';
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

/**
 * Map ApiCompany to Company
 */
export function mapApiCompanyToCompany(company: ApiCompany): Company {
  return {
    id: company.id,
    name: company.name || company.domains[0] || 'Unknown',
    domains: company.domains,
    tier: 'Standard', // TODO: Add tier to company API
    labels: [],
    totalEmails: company.emailCount ?? 0,
    avgTAT: '—',
    escalations: 0,
    lastContact: formatRelativeDate(company.lastContactDate),
    sentiment: 'Neutral',
    churnRisk: 'Low',
    engagement: 'Project',
    contacts: [],
    emails: [],
    tenantId: company.tenantId,
    website: company.website || undefined,
    industry: company.industry || undefined,
    metadata: company.metadata || undefined,
  };
}

/**
 * Contact type for UI components
 */
export interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  companyId?: string;
}

/**
 * Map ApiContact to Contact
 */
export function mapApiContactToContact(contact: ApiContact): Contact {
  return {
    id: contact.id,
    name: contact.name || contact.email.split('@')[0],
    email: contact.email,
    phone: contact.phone || undefined,
    title: contact.title || undefined,
    companyId: contact.companyId || undefined,
  };
}

/**
 * Email type for UI components
 */
export interface Email {
  id: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
}

/**
 * Escalation type for UI components
 */
export interface Escalation {
  id: string;
  title: string;
  companyId: string;
  companyName: string;
  contactEmail: string;
  description: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Open' | 'In Progress' | 'Resolved';
  assignedTo: string;
  responseTime: string;
  created: string;
  lastUpdate: string;
  isPremier: boolean;
}

/**
 * Predefined labels for companies
 */
export const predefinedLabels = [
  "Premier",
  "Subscription",
  "PAYG",
  "Enterprise",
  "Startup",
  "Partner",
  "VIP",
  "Trial",
  "Government",
  "Non-Profit",
];
