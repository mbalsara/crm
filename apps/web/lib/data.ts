export interface Contact {
  id: string
  name: string
  email: string
  phone: string
  title: string
}

export interface Email {
  id: string
  from: string
  to: string
  date: string
  subject: string
  body: string
}

export interface Company {
  id: string
  name: string
  domains: string[]
  tier: "Premier" | "Standard" | "Basic"
  labels: string[]
  totalEmails: number
  avgTAT: string
  escalations: number
  lastContact: string
  sentiment: "Positive" | "Negative" | "Neutral"
  churnRisk: "Low" | "Medium" | "High"
  engagement: "Retainer" | "Time & Material" | "Project"
  contacts: Contact[]
  emails: Email[]
}

export interface Escalation {
  id: string
  title: string
  customerId: string
  customerName: string
  contactEmail: string
  description: string
  priority: "Critical" | "High" | "Medium" | "Low"
  status: "Open" | "In Progress" | "Resolved"
  assignedTo: string
  responseTime: string
  created: string
  lastUpdate: string
  isPremier: boolean
}

/**
 * @deprecated Use User type from ./types instead
 * Kept for backwards compatibility during migration
 */
export interface Employee {
  id: string
  name: string
  email: string
  role: string
  department: string
  avatar?: string
  reportsTo: string[] // Array of employee IDs (can report to multiple managers)
  assignedCompanies: string[] // Array of company IDs
  status: "Active" | "Inactive" | "On Leave"
  joinedDate: string
}

export const companies: Company[] = [
  {
    id: "1",
    name: "Acme Corporation",
    domains: ["acmecorp.com", "acme.io"],
    tier: "Premier",
    labels: ["Premier", "Subscription", "Enterprise"],
    totalEmails: 247,
    avgTAT: "3.2h",
    escalations: 3,
    lastContact: "2 hours ago",
    sentiment: "Negative",
    churnRisk: "High",
    engagement: "Retainer",
    contacts: [
      { id: "c1", name: "Sarah Johnson", email: "sarah.johnson@acmecorp.com", phone: "+1 555-0101", title: "CEO" },
      { id: "c2", name: "Mike Chen", email: "mike.chen@acmecorp.com", phone: "+1 555-0102", title: "CTO" },
      { id: "c3", name: "Lisa Park", email: "lisa.park@acmecorp.com", phone: "+1 555-0103", title: "VP Engineering" },
    ],
    emails: [
      {
        id: "e1",
        from: "sarah.johnson@acmecorp.com",
        to: "support@company.com",
        date: "2024-01-15 10:30",
        subject: "Urgent: Production Issue",
        body: "We are experiencing critical downtime...",
      },
      {
        id: "e2",
        from: "mike.chen@acmecorp.com",
        to: "support@company.com",
        date: "2024-01-14 15:45",
        subject: "API Integration Question",
        body: "Need help with the new API endpoints...",
      },
    ],
  },
  {
    id: "2",
    name: "TechStart Inc.",
    domains: ["techstart.io"],
    tier: "Standard",
    labels: ["PAYG", "Startup"],
    totalEmails: 128,
    avgTAT: "1.8h",
    escalations: 0,
    lastContact: "1 day ago",
    sentiment: "Positive",
    churnRisk: "Low",
    engagement: "Time & Material",
    contacts: [
      {
        id: "c4",
        name: "Emily Rodriguez",
        email: "emily.rodriguez@techstart.io",
        phone: "+1 555-0201",
        title: "VP Operations",
      },
    ],
    emails: [
      {
        id: "e3",
        from: "emily.rodriguez@techstart.io",
        to: "support@company.com",
        date: "2024-01-14 09:00",
        subject: "Feature Request",
        body: "Would love to see...",
      },
    ],
  },
  {
    id: "3",
    name: "Global Systems Ltd.",
    domains: ["globalsys.com", "gs-solutions.net"],
    tier: "Premier",
    labels: ["Premier", "Subscription", "Partner"],
    totalEmails: 512,
    avgTAT: "2.4h",
    escalations: 1,
    lastContact: "5 hours ago",
    sentiment: "Neutral",
    churnRisk: "Medium",
    engagement: "Retainer",
    contacts: [
      { id: "c5", name: "David Park", email: "david.park@globalsys.com", phone: "+1 555-0301", title: "CTO" },
      {
        id: "c6",
        name: "Anna Williams",
        email: "anna.williams@globalsys.com",
        phone: "+1 555-0302",
        title: "Director of IT",
      },
    ],
    emails: [
      {
        id: "e4",
        from: "david.park@globalsys.com",
        to: "support@company.com",
        date: "2024-01-15 08:00",
        subject: "Billing Question",
        body: "Need clarification on the latest invoice...",
      },
    ],
  },
  {
    id: "4",
    name: "Innovate Labs",
    domains: ["innovatelabs.co"],
    tier: "Basic",
    labels: ["Trial"],
    totalEmails: 45,
    avgTAT: "4.5h",
    escalations: 0,
    lastContact: "3 days ago",
    sentiment: "Positive",
    churnRisk: "Low",
    engagement: "Project",
    contacts: [
      { id: "c7", name: "James Wilson", email: "james@innovatelabs.co", phone: "+1 555-0401", title: "Founder" },
    ],
    emails: [],
  },
  {
    id: "5",
    name: "CloudScale Solutions",
    domains: ["cloudscale.io", "cs-cloud.com"],
    tier: "Premier",
    labels: ["Premier", "Enterprise", "VIP"],
    totalEmails: 389,
    avgTAT: "1.5h",
    escalations: 2,
    lastContact: "30 mins ago",
    sentiment: "Negative",
    churnRisk: "High",
    engagement: "Retainer",
    contacts: [
      { id: "c8", name: "Robert Kim", email: "robert.kim@cloudscale.io", phone: "+1 555-0501", title: "CEO" },
      {
        id: "c9",
        name: "Maria Garcia",
        email: "maria.garcia@cloudscale.io",
        phone: "+1 555-0502",
        title: "VP Customer Success",
      },
    ],
    emails: [
      {
        id: "e5",
        from: "robert.kim@cloudscale.io",
        to: "support@company.com",
        date: "2024-01-15 11:30",
        subject: "Service Level Concerns",
        body: "We need to discuss the recent outages...",
      },
    ],
  },
]

export const escalations: Escalation[] = [
  {
    id: "esc1",
    title: "Service Level Agreement Breach",
    customerId: "1",
    customerName: "Acme Corporation",
    contactEmail: "sarah.johnson@acmecorp.com",
    description:
      "Customer reporting multiple service outages affecting their production environment. SLA breach imminent.",
    priority: "Critical",
    status: "Open",
    assignedTo: "Michael B.",
    responseTime: "3.2h",
    created: "2 hours ago",
    lastUpdate: "30 mins ago",
    isPremier: true,
  },
  {
    id: "esc2",
    title: "Billing Discrepancy - Urgent",
    customerId: "3",
    customerName: "Global Systems Ltd.",
    contactEmail: "david.park@globalsys.com",
    description: "Customer disputes recent invoice charges. Financial team escalation required.",
    priority: "High",
    status: "In Progress",
    assignedTo: "John D.",
    responseTime: "2.4h",
    created: "1 day ago",
    lastUpdate: "2 hours ago",
    isPremier: true,
  },
  {
    id: "esc3",
    title: "API Performance Degradation",
    customerId: "5",
    customerName: "CloudScale Solutions",
    contactEmail: "robert.kim@cloudscale.io",
    description: "Customer experiencing slow API response times during peak hours. Affecting their end users.",
    priority: "Critical",
    status: "Open",
    assignedTo: "Sarah M.",
    responseTime: "1.5h",
    created: "4 hours ago",
    lastUpdate: "1 hour ago",
    isPremier: true,
  },
  {
    id: "esc4",
    title: "Data Export Feature Request",
    customerId: "2",
    customerName: "TechStart Inc.",
    contactEmail: "emily.rodriguez@techstart.io",
    description: "Customer needs bulk data export functionality for compliance audit.",
    priority: "Medium",
    status: "In Progress",
    assignedTo: "Emily R.",
    responseTime: "1.8h",
    created: "2 days ago",
    lastUpdate: "1 day ago",
    isPremier: false,
  },
  {
    id: "esc5",
    title: "Database Connection Timeout",
    customerId: "1",
    customerName: "Acme Corporation",
    contactEmail: "mike.chen@acmecorp.com",
    description: "Intermittent database connection timeouts causing transaction failures. Customer losing revenue.",
    priority: "Critical",
    status: "In Progress",
    assignedTo: "Michael B.",
    responseTime: "2.1h",
    created: "3 hours ago",
    lastUpdate: "45 mins ago",
    isPremier: true,
  },
  {
    id: "esc6",
    title: "SSO Integration Failure",
    customerId: "3",
    customerName: "Global Systems Ltd.",
    contactEmail: "anna.williams@globalsys.com",
    description: "Single sign-on integration stopped working after their IdP update. Users cannot access platform.",
    priority: "High",
    status: "Open",
    assignedTo: "Sarah M.",
    responseTime: "1.9h",
    created: "5 hours ago",
    lastUpdate: "2 hours ago",
    isPremier: true,
  },
  {
    id: "esc7",
    title: "Report Generation Slow",
    customerId: "5",
    customerName: "CloudScale Solutions",
    contactEmail: "maria.garcia@cloudscale.io",
    description:
      "Monthly reports taking over 30 minutes to generate. Customer needs faster turnaround for board meetings.",
    priority: "Medium",
    status: "In Progress",
    assignedTo: "John D.",
    responseTime: "3.5h",
    created: "1 day ago",
    lastUpdate: "6 hours ago",
    isPremier: true,
  },
  {
    id: "esc8",
    title: "Mobile App Crash on iOS",
    customerId: "2",
    customerName: "TechStart Inc.",
    contactEmail: "emily.rodriguez@techstart.io",
    description: "iOS app crashing on launch after latest update. Android working fine. Blocking mobile workforce.",
    priority: "High",
    status: "Open",
    assignedTo: "Sarah M.",
    responseTime: "1.2h",
    created: "2 hours ago",
    lastUpdate: "1 hour ago",
    isPremier: false,
  },
  {
    id: "esc9",
    title: "Webhook Delivery Failures",
    customerId: "1",
    customerName: "Acme Corporation",
    contactEmail: "lisa.park@acmecorp.com",
    description: "Webhooks not being delivered to their endpoint. Missing critical event notifications for automation.",
    priority: "High",
    status: "In Progress",
    assignedTo: "Michael B.",
    responseTime: "2.8h",
    created: "8 hours ago",
    lastUpdate: "3 hours ago",
    isPremier: true,
  },
  {
    id: "esc10",
    title: "User Permission Issues",
    customerId: "4",
    customerName: "Innovate Labs",
    contactEmail: "james@innovatelabs.co",
    description: "New team members unable to access shared dashboards despite correct role assignment.",
    priority: "Low",
    status: "Open",
    assignedTo: "Emily R.",
    responseTime: "4.2h",
    created: "2 days ago",
    lastUpdate: "1 day ago",
    isPremier: false,
  },
  {
    id: "esc11",
    title: "Email Notification Delay",
    customerId: "3",
    customerName: "Global Systems Ltd.",
    contactEmail: "david.park@globalsys.com",
    description: "Email notifications arriving 2-3 hours late. Customer needs real-time alerts for compliance.",
    priority: "Medium",
    status: "Resolved",
    assignedTo: "John D.",
    responseTime: "1.5h",
    created: "3 days ago",
    lastUpdate: "1 day ago",
    isPremier: true,
  },
  {
    id: "esc12",
    title: "Data Sync Inconsistency",
    customerId: "5",
    customerName: "CloudScale Solutions",
    contactEmail: "robert.kim@cloudscale.io",
    description: "Data between primary and secondary regions showing inconsistencies. Potential data integrity issue.",
    priority: "Critical",
    status: "In Progress",
    assignedTo: "Sarah M.",
    responseTime: "0.8h",
    created: "1 hour ago",
    lastUpdate: "20 mins ago",
    isPremier: true,
  },
  {
    id: "esc13",
    title: "Custom Field Validation Error",
    customerId: "2",
    customerName: "TechStart Inc.",
    contactEmail: "emily.rodriguez@techstart.io",
    description: "Custom field validation rejecting valid input. Blocking data entry for sales team.",
    priority: "Medium",
    status: "Open",
    assignedTo: "Emily R.",
    responseTime: "2.0h",
    created: "6 hours ago",
    lastUpdate: "4 hours ago",
    isPremier: false,
  },
  {
    id: "esc14",
    title: "Dashboard Widget Loading Error",
    customerId: "1",
    customerName: "Acme Corporation",
    contactEmail: "sarah.johnson@acmecorp.com",
    description: "Executive dashboard widgets showing loading spinner indefinitely. CEO unable to view KPIs.",
    priority: "High",
    status: "Resolved",
    assignedTo: "Michael B.",
    responseTime: "1.1h",
    created: "1 day ago",
    lastUpdate: "12 hours ago",
    isPremier: true,
  },
  {
    id: "esc15",
    title: "Bulk Import Failure",
    customerId: "4",
    customerName: "Innovate Labs",
    contactEmail: "james@innovatelabs.co",
    description: "CSV import failing silently with large files. No error message displayed to user.",
    priority: "Low",
    status: "In Progress",
    assignedTo: "John D.",
    responseTime: "5.0h",
    created: "4 days ago",
    lastUpdate: "2 days ago",
    isPremier: false,
  },
  {
    id: "esc16",
    title: "Two-Factor Authentication Issue",
    customerId: "3",
    customerName: "Global Systems Ltd.",
    contactEmail: "anna.williams@globalsys.com",
    description: "2FA codes from authenticator app not being accepted. Multiple users locked out of accounts.",
    priority: "Critical",
    status: "Open",
    assignedTo: "Sarah M.",
    responseTime: "0.5h",
    created: "30 mins ago",
    lastUpdate: "10 mins ago",
    isPremier: true,
  },
  {
    id: "esc17",
    title: "Search Function Not Returning Results",
    customerId: "5",
    customerName: "CloudScale Solutions",
    contactEmail: "maria.garcia@cloudscale.io",
    description: "Global search returning empty results for existing records. Severely impacting productivity.",
    priority: "High",
    status: "In Progress",
    assignedTo: "Emily R.",
    responseTime: "1.3h",
    created: "3 hours ago",
    lastUpdate: "1 hour ago",
    isPremier: true,
  },
  {
    id: "esc18",
    title: "Calendar Integration Sync Issue",
    customerId: "2",
    customerName: "TechStart Inc.",
    contactEmail: "emily.rodriguez@techstart.io",
    description: "Google Calendar events not syncing bidirectionally. Missing meetings and double bookings.",
    priority: "Medium",
    status: "Resolved",
    assignedTo: "John D.",
    responseTime: "2.5h",
    created: "5 days ago",
    lastUpdate: "3 days ago",
    isPremier: false,
  },
  {
    id: "esc19",
    title: "File Upload Size Limit Error",
    customerId: "1",
    customerName: "Acme Corporation",
    contactEmail: "mike.chen@acmecorp.com",
    description: "Unable to upload files larger than 10MB despite documentation saying 100MB limit.",
    priority: "Medium",
    status: "Open",
    assignedTo: "Michael B.",
    responseTime: "3.0h",
    created: "12 hours ago",
    lastUpdate: "8 hours ago",
    isPremier: true,
  },
  {
    id: "esc20",
    title: "Automated Workflow Trigger Failure",
    customerId: "3",
    customerName: "Global Systems Ltd.",
    contactEmail: "david.park@globalsys.com",
    description: "Automated workflows not triggering on record creation. Manual intervention required for every case.",
    priority: "High",
    status: "In Progress",
    assignedTo: "Sarah M.",
    responseTime: "1.7h",
    created: "7 hours ago",
    lastUpdate: "2 hours ago",
    isPremier: true,
  },
]

export const dashboardStats = {
  totalCustomers: 247,
  customersChange: "+12% from last month",
  emailsAnalyzed: 15200,
  emailsChange: "+8% from last week",
  avgTurnaroundTime: "2.8h",
  tatChange: "-15% improvement",
  activeEscalations: 8,
  escalationsNew: "3 new today",
  upsellOpportunities: 23,
  upsellChange: "+5 this week",
  premierAccounts: 42,
  premierCompliance: "100% SLA compliance",
}

export const sentimentData = [
  { name: "Positive", value: 58, fill: "#22c55e" },
  { name: "Neutral", value: 32, fill: "#f59e0b" },
  { name: "Negative", value: 10, fill: "#ef4444" },
]

export const turnaroundData = [
  { name: "Sarah M.", hours: 2.1 },
  { name: "John D.", hours: 2.8 },
  { name: "Emily R.", hours: 1.5 },
  { name: "Michael B.", hours: 4.2 },
  { name: "Lisa K.", hours: 3.1 },
]

/**
 * @deprecated Use User type and fetch from API instead
 * Kept for backwards compatibility during migration
 */
export const employees: Employee[] = [
  {
    id: "emp1",
    name: "Sarah Mitchell",
    email: "sarah.m@company.com",
    role: "Senior Account Manager",
    department: "Customer Success",
    reportsTo: ["emp5"],
    assignedCompanies: ["1", "3", "5"],
    status: "Active",
    joinedDate: "2022-03-15",
  },
  {
    id: "emp2",
    name: "John Davis",
    email: "john.d@company.com",
    role: "Account Manager",
    department: "Customer Success",
    reportsTo: ["emp1", "emp5"],
    assignedCompanies: ["2", "4"],
    status: "Active",
    joinedDate: "2023-01-10",
  },
  {
    id: "emp3",
    name: "Emily Roberts",
    email: "emily.r@company.com",
    role: "Support Specialist",
    department: "Support",
    reportsTo: ["emp1"],
    assignedCompanies: ["1", "2"],
    status: "Active",
    joinedDate: "2023-06-20",
  },
  {
    id: "emp4",
    name: "Michael Brown",
    email: "michael.b@company.com",
    role: "Technical Support Lead",
    department: "Support",
    reportsTo: ["emp5"],
    assignedCompanies: ["1", "3", "5"],
    status: "Active",
    joinedDate: "2021-11-01",
  },
  {
    id: "emp5",
    name: "Lisa Kim",
    email: "lisa.k@company.com",
    role: "Director of Customer Success",
    department: "Customer Success",
    reportsTo: [],
    assignedCompanies: ["1", "2", "3", "4", "5"],
    status: "Active",
    joinedDate: "2020-08-15",
  },
  {
    id: "emp6",
    name: "David Chen",
    email: "david.c@company.com",
    role: "Account Manager",
    department: "Customer Success",
    reportsTo: ["emp1"],
    assignedCompanies: ["3"],
    status: "On Leave",
    joinedDate: "2022-09-01",
  },
]

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
]
