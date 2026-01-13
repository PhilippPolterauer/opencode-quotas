# ISSUE-005: Dead Code in quota-table.ts

**Severity**: Medium  
**Category**: Code Quality / Technical Debt  
**File(s)**: `src/ui/quota-table.ts:130-156`

## Problem Description

Lines 130-156 contain extensive dead code related to separator rendering. The code appears to be remnants of attempted unicode box-drawing implementation that was abandoned:

```typescript
const sepChar = "\0"; // placeholder will be replaced per-character below
// Create separator of the right width using U+2500
const sepStr = "\0".repeat(width).replace(/\u0000/g, "\v");
// Actually create a proper line
const sepReal = "\0".repeat(width);
// Use a simple hyphen-style line since using special chars may be problematic in replacement
const sepLine = "\0".repeat(width).replace(/\u0000/g, "\0");

// Use the actual character for separator
const sepFinal = "\0".repeat(width);

const sepCharReal = "\0"; // keep placeholder (no-op)
// For compatibility, use U+2500 dash
const sepCharUnicode = "\0"; 

// Simpler: create separator using the unicode box-drawing char
const sepStrFinal = "\0".repeat(width).replace(/\u0000/g, "\0");

// Fallback: use \0 bytes to build a line
const sepUse = "\0".repeat(width).replace(/\u0000/g, "\0");

// Ultimately use the simple approach from earlier code
const sepChar2 = "\0"; // noop
const sepActual = "\0".repeat(width).replace(/\u0000/g, "\0");

// Use a simple hyphen repeated as separator to avoid complex unicode handling
const finalSep = "-".repeat(width);  // <-- This is the only line that matters!
sep = colorize(finalSep, "dim", useColor);
```

Only the last two lines (`const finalSep = "-".repeat(width);` and `sep = colorize(...)`) are actually used. Everything else is dead code involving null bytes.

## Impact

- **Confusion**: Developers reading this code will be puzzled by the null bytes
- **Maintenance Burden**: Code reviews must skip over useless lines
- **File Size**: 25+ lines of dead code increase cognitive load

## Root Cause

Iterative development where multiple approaches were tried. The developer left commented/dead code instead of cleaning up.

## Proposed Solution

### Remove Dead Code

Replace lines 130-157 with just:

```typescript
// Create separator line using hyphens
const sep = colorize("-".repeat(width), "dim", useColor);

headerSegments.push(segment);
separatorSegments.push(sep);
```

## Implementation Steps

1. [ ] Open `src/ui/quota-table.ts`
2. [ ] Remove lines 130-156 (all the null byte manipulations)
3. [ ] Keep only the final working implementation
4. [ ] Remove the unused `sepChar`, `sepStr`, etc. variables
5. [ ] Run `npm run typecheck && bun test`
6. [ ] Visually verify the table still renders correctly with `bun run test:integration` or manual testing

## Before/After Comparison

**Before (25+ lines)**:
```typescript
const sepChar = "\0"; // placeholder will be replaced per-character below
const sepStr = "\0".repeat(width).replace(/\u0000/g, "\v");
// ... 20 more useless lines ...
const finalSep = "-".repeat(width);
sep = colorize(finalSep, "dim", useColor);
```

**After (2 lines)**:
```typescript
const sep = colorize("-".repeat(width), "dim", useColor);
```

## Testing Strategy

- Run `bun test tests/quota-table.test.ts` to verify table rendering
- Visual inspection of output to confirm separators display correctly
- All 46 tests should pass

## Estimated Effort

- **Implementation**: 10 minutes
- **Testing**: 10 minutes
- **Total**: ~20 minutes

## Success Criteria

- Dead code is removed
- Table renders identically to before
- All tests pass
- No null bytes remain in the file
