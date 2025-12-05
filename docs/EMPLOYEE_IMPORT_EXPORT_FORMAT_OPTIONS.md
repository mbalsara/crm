# Employee Import/Export Format Options

## Challenge

Employees can have:
- **Multiple managers** (managerIds: UUID[])
- **Multiple companies** (companyIds: UUID[])

CSV/Excel is flat/tabular, so we need a way to represent arrays in a single row.

## Option 1: Comma-Separated Values in Single Column

### Format
```csv
id,firstName,lastName,email,managerIds,companyIds,active
emp-1,John,Doe,john@example.com,"mgr-1,mgr-2","comp-1,comp-2",0
emp-2,Jane,Smith,jane@example.com,"mgr-1","comp-1,comp-2,comp-3",0
```

### Excel Example
| id | firstName | lastName | email | managerIds | companyIds | active |
|----|-----------|----------|-------|------------|------------|--------|
| emp-1 | John | Doe | john@example.com | mgr-1,mgr-2 | comp-1,comp-2 | 0 |
| emp-2 | Jane | Smith | jane@example.com | mgr-1 | comp-1,comp-2,comp-3 | 0 |

### Pros
- ✅ Simple, single row per employee
- ✅ Easy to read/edit in Excel
- ✅ Standard CSV format (quoted strings)
- ✅ Works well for small arrays (< 10 items)

### Cons
- ❌ Hard to edit if many managers/companies
- ❌ Can't easily add/remove individual items
- ❌ Requires parsing on import
- ❌ No validation until import

### Best For
- Small number of relationships (< 5 managers/companies)
- Simple use cases
- Non-technical users

---

## Option 2: Multiple Columns (Fixed Width)

### Format
```csv
id,firstName,lastName,email,manager1,manager2,manager3,company1,company2,company3,active
emp-1,John,Doe,john@example.com,mgr-1,mgr-2,,comp-1,comp-2,,0
emp-2,Jane,Smith,jane@example.com,mgr-1,,,comp-1,comp-2,comp-3,0
```

### Excel Example
| id | firstName | lastName | email | manager1 | manager2 | manager3 | company1 | company2 | company3 | active |
|----|-----------|---------|-------|----------|----------|----------|-----------|-----------|----------|--------|
| emp-1 | John | Doe | john@example.com | mgr-1 | mgr-2 | | comp-1 | comp-2 | | 0 |
| emp-2 | Jane | Smith | jane@example.com | mgr-1 | | | comp-1 | comp-2 | comp-3 | 0 |

### Pros
- ✅ Easy to edit in Excel (one cell per relationship)
- ✅ Can sort/filter by manager/company columns
- ✅ Clear structure
- ✅ No parsing needed

### Cons
- ❌ Fixed limit (e.g., max 3 managers, 3 companies)
- ❌ Wastes columns if employee has fewer relationships
- ❌ Many empty cells
- ❌ What if employee has 4 managers? (need to increase columns)

### Best For
- Known maximum number of relationships
- Users who need to sort/filter by manager/company
- When relationships are typically small (< 5)

---

## Option 3: Separate Rows (Denormalized)

### Format
```csv
id,firstName,lastName,email,managerId,companyId,active
emp-1,John,Doe,john@example.com,mgr-1,comp-1,0
emp-1,John,Doe,john@example.com,mgr-1,comp-2,0
emp-1,John,Doe,john@example.com,mgr-2,comp-1,0
emp-1,John,Doe,john@example.com,mgr-2,comp-2,0
emp-2,Jane,Smith,jane@example.com,mgr-1,comp-1,0
emp-2,Jane,Smith,jane@example.com,mgr-1,comp-2,0
emp-2,Jane,Smith,jane@example.com,mgr-1,comp-3,0
```

### Excel Example
| id | firstName | lastName | email | managerId | companyId | active |
|----|-----------|---------|-------|-----------|-----------|--------|
| emp-1 | John | Doe | john@example.com | mgr-1 | comp-1 | 0 |
| emp-1 | John | Doe | john@example.com | mgr-1 | comp-2 | 0 |
| emp-1 | John | Doe | john@example.com | mgr-2 | comp-1 | 0 |
| emp-1 | John | Doe | john@example.com | mgr-2 | comp-2 | 0 |

### Pros
- ✅ One relationship per row (simple structure)
- ✅ Easy to add/remove relationships
- ✅ Can filter by manager/company easily
- ✅ No parsing needed
- ✅ No limits on number of relationships

### Cons
- ❌ Data duplication (employee info repeated)
- ❌ Large files (many rows)
- ❌ Hard to see all relationships for one employee
- ❌ More complex import logic (group by employee)

### Best For
- Many relationships per employee
- When relationships change frequently
- When you need to filter by manager/company

---

## Option 4: Separate Sheets (Excel Only)

### Format
**Sheet 1: Employees**
```csv
id,firstName,lastName,email,active
emp-1,John,Doe,john@example.com,0
emp-2,Jane,Smith,jane@example.com,0
```

**Sheet 2: Employee-Managers**
```csv
employeeId,managerId
emp-1,mgr-1
emp-1,mgr-2
emp-2,mgr-1
```

**Sheet 3: Employee-Companies**
```csv
employeeId,companyId
emp-1,comp-1
emp-1,comp-2
emp-2,comp-1
emp-2,comp-2
emp-2,comp-3
```

### Pros
- ✅ Clean separation of concerns
- ✅ No data duplication
- ✅ Easy to manage relationships
- ✅ Can have unlimited relationships
- ✅ Professional structure

### Cons
- ❌ Excel-only (CSV doesn't support sheets)
- ❌ More complex import/export logic
- ❌ Harder for non-technical users
- ❌ Need to maintain referential integrity

### Best For
- Excel users only
- Complex relationships
- Professional/enterprise use
- When relationships are managed separately

---

## Option 5: Email/Name Lookup (Human-Friendly)

### Format
```csv
firstName,lastName,email,managerEmails,companyDomains,active
John,Doe,john@example.com,"manager1@example.com,manager2@example.com","acme.com,techcorp.com",0
Jane,Smith,jane@example.com,"manager1@example.com","acme.com,techcorp.com,startup.io",0
```

### Excel Example
| firstName | lastName | email | managerEmails | companyDomains | active |
|-----------|----------|-------|----------------|----------------|--------|
| John | Doe | john@example.com | manager1@example.com,manager2@example.com | acme.com,techcorp.com | 0 |
| Jane | Smith | jane@example.com | manager1@example.com | acme.com,techcorp.com,startup.io | 0 |

### Pros
- ✅ Human-readable (emails/domains instead of UUIDs)
- ✅ Easy to edit without knowing UUIDs
- ✅ Can resolve on import (lookup by email/domain)
- ✅ Works well for initial imports

### Cons
- ❌ Requires lookup/resolution on import
- ❌ Ambiguity if email/domain not found
- ❌ Need to handle missing references
- ❌ Slower import (database lookups)

### Best For
- Initial bulk imports
- Non-technical users
- When UUIDs are not known
- Human-friendly workflows

---

## Option 6: Hybrid Approach (Recommended)

### Format: Single Row with Email/Name Lookup

```csv
firstName,lastName,email,managerEmails,companyDomains,active
John,Doe,john@example.com,"manager1@example.com,manager2@example.com","acme.com,techcorp.com",0
Jane,Smith,jane@example.com,"manager1@example.com","acme.com,techcorp.com,startup.io",0
```

**On Import:**
1. Resolve manager emails → managerIds
2. Resolve company domains → companyIds
3. Create employee with relationships

**On Export:**
1. Lookup manager emails from managerIds
2. Lookup company domains from companyIds
3. Export human-readable format

### Pros
- ✅ Human-readable (emails/domains)
- ✅ Single row per employee
- ✅ Easy to edit in Excel
- ✅ Works for both import and export

### Cons
- ❌ Requires resolution on import
- ❌ Need to handle missing references
- ❌ Slightly slower import

---

## Comparison Table

| Option | Readability | Editability | Scalability | Complexity | Best For |
|--------|-------------|-------------|------------|------------|----------|
| **1. Comma-separated** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | Small arrays |
| **2. Multiple columns** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | Fixed limits |
| **3. Separate rows** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | Many relationships |
| **4. Separate sheets** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐ | Excel only |
| **5. Email/Name lookup** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | Human-friendly |
| **6. Hybrid** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | **Recommended** |

---

## Recommendation: Option 6 (Hybrid)

### Import Format
```csv
firstName,lastName,email,managerEmails,companyDomains,active
John,Doe,john@example.com,"manager1@example.com,manager2@example.com","acme.com,techcorp.com",0
```

### Export Format
```csv
id,firstName,lastName,email,managerEmails,companyDomains,active
emp-1,John,Doe,john@example.com,"manager1@example.com,manager2@example.com","acme.com,techcorp.com",0
```

### Why This Works Best

1. **Human-readable**: Uses emails/domains instead of UUIDs
2. **Easy to edit**: Single row per employee, comma-separated arrays
3. **Flexible**: No limits on number of relationships
4. **Works for both**: Import and export use same format
5. **Excel-friendly**: Works well in Excel (quoted strings)

### Import Process

1. Parse CSV/Excel file
2. For each row:
   - Resolve `managerEmails` → lookup manager IDs
   - Resolve `companyDomains` → lookup company IDs
   - Create employee with relationships
3. Handle errors:
   - Missing manager → error or skip
   - Missing company → error or skip
   - Duplicate email → update or error

### Export Process

1. Fetch employees with relationships
2. For each employee:
   - Lookup manager emails from managerIds
   - Lookup company domains from companyIds
   - Format as CSV row
3. Generate CSV/Excel file

---

## Alternative: Support Multiple Formats

We could support **both** formats:

1. **Simple format** (Option 1): Comma-separated UUIDs
   - For technical users
   - Faster import (no lookups)

2. **Human-friendly format** (Option 6): Email/domain lookup
   - For non-technical users
   - Easier to edit

**Implementation**: Detect format on import (check if values are UUIDs or emails/domains)

---

## Questions to Decide

1. **Primary format**: Option 1 (UUIDs) or Option 6 (emails/domains)?
2. **Support multiple formats**: Yes or no?
3. **Error handling**: What if manager/company not found?
   - Skip employee?
   - Create placeholder?
   - Fail entire import?
4. **Update vs Create**: If employee exists (by email), update or error?
5. **Validation**: Required fields? Email format? etc.

---

## My Recommendation

**Use Option 6 (Hybrid - Email/Name Lookup)** because:
- ✅ Most user-friendly
- ✅ Works for both import and export
- ✅ Single row per employee
- ✅ Easy to edit in Excel
- ✅ No limits on relationships

**With fallback**: Support Option 1 (UUIDs) for technical users who want faster imports.

What do you think? Which format do you prefer?
