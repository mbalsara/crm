# Employee Import/Export for Large Scale (50-100 Customers)

## The Problem

If employees can have **50-100 customers**, comma-separated values in a single cell becomes problematic:

```
customerDomains: "acme.com,techcorp.com,startup.io,bigcorp.com,smallbiz.com,..." (50+ values)
```

**Issues:**
- ❌ Very long cells (hard to read/edit)
- ❌ Excel cell limit concerns (32,767 characters)
- ❌ Hard to add/remove individual customers
- ❌ Can't easily filter/sort by company
- ❌ Poor UX in Excel

## Revised Options for Large Scale

### Option A: Separate Rows (Denormalized) - RECOMMENDED

#### Format
```csv
id,firstName,lastName,email,managerEmails,companyDomain,active
emp-1,John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",acme.com,0
emp-1,John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",techcorp.com,0
emp-1,John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",startup.io,0
... (50 more rows for John)
emp-2,Jane,Smith,jane@example.com,"mgr-1@example.com",acme.com,0
emp-2,Jane,Smith,jane@example.com,"mgr-1@example.com",techcorp.com,0
... (100 rows for Jane)
```

#### Excel Example
| id | firstName | lastName | email | managerEmails | companyDomain | active |
|----|-----------|----------|-------|---------------|---------------|--------|
| emp-1 | John | Doe | john@example.com | mgr-1@example.com,mgr-2@example.com | acme.com | 0 |
| emp-1 | John | Doe | john@example.com | mgr-1@example.com,mgr-2@example.com | techcorp.com | 0 |
| emp-1 | John | Doe | john@example.com | mgr-1@example.com,mgr-2@example.com | startup.io | 0 |
| ... | ... | ... | ... | ... | ... | ... |

**One row per employee-company combination**

#### Pros
- ✅ **No limits** - Can have unlimited customers
- ✅ **Easy to edit** - One company per row
- ✅ **Easy to filter** - Filter by companyDomain column
- ✅ **Easy to add/remove** - Add/delete rows
- ✅ **Excel-friendly** - Works well with Excel filters/sorting
- ✅ **Clear structure** - One relationship per row

#### Cons
- ❌ **Data duplication** - Employee info repeated (but manageable)
- ❌ **Large files** - 50-100 rows per employee
- ❌ **Hard to see overview** - Need to scroll to see all customers

#### Best For
- ✅ **Many customers per employee** (50-100+)
- ✅ When customers change frequently
- ✅ When you need to filter by company

---

### Option B: Separate Sheets (Excel Only)

#### Format

**Sheet 1: Employees**
```csv
id,firstName,lastName,email,managerEmails,active
emp-1,John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",0
emp-2,Jane,Smith,jane@example.com,"mgr-1@example.com",0
```

**Sheet 2: Employee-Customers**
```csv
employeeEmail,companyDomain
john@example.com,acme.com
john@example.com,techcorp.com
john@example.com,startup.io
... (50 more rows)
jane@example.com,acme.com
jane@example.com,techcorp.com
... (100 rows)
```

#### Pros
- ✅ **No data duplication** - Employee info in one place
- ✅ **Clean separation** - Relationships separate
- ✅ **Easy to manage** - Add/remove customers easily
- ✅ **No limits** - Unlimited customers
- ✅ **Professional** - Enterprise-friendly structure

#### Cons
- ❌ **Excel-only** - CSV doesn't support sheets
- ❌ **More complex** - Need to maintain referential integrity
- ❌ **Harder for non-technical users** - Multiple sheets

#### Best For
- ✅ **Excel users** (not CSV)
- ✅ **Enterprise/professional** use
- ✅ **Complex relationships**
- ✅ **When relationships managed separately**

---

### Option C: Hybrid Approach (Different Formats)

#### Format

**Managers**: Comma-separated (usually few)
**Customers**: Separate rows (many)

```csv
id,firstName,lastName,email,managerEmails,companyDomain,active
emp-1,John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",acme.com,0
emp-1,John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",techcorp.com,0
emp-1,John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",startup.io,0
```

**Logic:**
- `managerEmails` stays comma-separated (typically 1-5 managers)
- `companyDomain` is single value per row (one row per company)

#### Pros
- ✅ **Best of both worlds** - Managers easy, customers scalable
- ✅ **Flexible** - Handles both small and large arrays
- ✅ **Excel-friendly** - Works well in Excel

#### Cons
- ❌ **Inconsistent** - Different formats for managers vs customers
- ❌ **Slightly complex** - Need to handle both formats

#### Best For
- ✅ **Mixed scenarios** - Few managers, many customers
- ✅ **When you want flexibility**

---

## Comparison for Large Scale (50-100 Customers)

| Option | Scalability | Editability | File Size | Complexity | Best For |
|--------|-------------|-------------|-----------|------------|----------|
| **A. Separate rows** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | **Many customers** |
| **B. Separate sheets** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐ | Excel only |
| **C. Hybrid** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | Mixed scenarios |

---

## Recommendation for 50-100 Customers

### **Option A: Separate Rows (Denormalized)**

**Why:**
1. ✅ **No limits** - Can handle 100+ customers easily
2. ✅ **Easy to edit** - One company per row in Excel
3. ✅ **Excel-friendly** - Works great with filters/sorting
4. ✅ **CSV compatible** - Works in both CSV and Excel
5. ✅ **Simple structure** - Easy to understand

**Format:**
```csv
id,firstName,lastName,email,managerEmails,companyDomain,active
emp-1,John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",acme.com,0
emp-1,John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",techcorp.com,0
emp-1,John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",startup.io,0
```

**Import Logic:**
1. Group rows by `email` (or `id`)
2. Collect all `companyDomain` values for each employee
3. Resolve `managerEmails` → managerIds (once per employee)
4. Resolve `companyDomain` → customerIds (for each row)
5. Create employee with all relationships

**Export Logic:**
1. For each employee:
   - Lookup manager emails from managerIds
   - For each customerId:
     - Lookup company domain
     - Create one row: employee info + one company domain

---

## Alternative: Support Both Formats

We could support **both** formats and auto-detect:

1. **Compact format** (Option 6): Comma-separated
   - For employees with < 10 customers
   - Single row per employee

2. **Expanded format** (Option A): Separate rows
   - For employees with many customers
   - One row per company

**Detection logic:**
- If `companyDomain` column exists → Expanded format
- If `customerDomains` (plural) column exists → Compact format

---

## Updated Recommendation

### **Primary Format: Option A (Separate Rows)**

**For Import:**
```csv
firstName,lastName,email,managerEmails,companyDomain,active
John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",acme.com,0
John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",techcorp.com,0
```

**For Export:**
```csv
id,firstName,lastName,email,managerEmails,companyDomain,active
emp-1,John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",acme.com,0
emp-1,John,Doe,john@example.com,"mgr-1@example.com,mgr-2@example.com",techcorp.com,0
```

**Key Points:**
- ✅ One row per employee-company combination
- ✅ `managerEmails` stays comma-separated (few managers)
- ✅ `companyDomain` is single value per row (many customers)
- ✅ Easy to edit in Excel
- ✅ Can filter by company
- ✅ No limits

---

## Questions

1. **Format**: Option A (separate rows) work for you?
2. **Managers**: Keep comma-separated or also separate rows?
   - Usually few managers (1-5) → comma-separated is fine
   - If many managers too → separate rows for both
3. **File size**: Is 50-100 rows per employee acceptable?
   - For 1000 employees with 50 customers each = 50,000 rows
   - Excel can handle this (1M row limit)
4. **Performance**: Import/export performance acceptable?
   - Import: Group by email, resolve relationships
   - Export: One query per employee, expand to rows

What do you think? Does Option A (separate rows) work for your use case?
