import { expect, test, describe } from "bun:test";
import { renderQuotaTable } from "../../src/ui/quota-table";
import { type QuotaData } from "../../src/interfaces";

describe("Quota Table Rendering", () => {
    test("aligns structured columns", () => {
        const quotas: QuotaData[] = [
            {
                id: "1",
                providerName: "Short",
                used: 50,
                limit: 100,
                unit: "%",
                reset: "in 1h",
                info: "Status",
            },
            {
                id: "2",
                providerName: "Longer Name",
                used: 50,
                limit: 100,
                unit: "%",
                reset: "in 22h 30m",
                info: "Longer Info",
            },
        ];

        const rows = renderQuotaTable(quotas, {
            tableConfig: { columns: ["name", "reset", "info"] }
        });
        
        // rows[0] is header
        // rows[1] is separator
        // rows[2] is data 1
        // rows[3] is data 2
        
        expect(rows.length).toBe(4);
        
        const row1 = rows[2].line;
        const row2 = rows[3].line;

        // name (padding) + reset (padding) + info
        // "Longer Name" is 11 chars. "QUOTA NAME" is 10 chars. Max 11.
        // "Short" becomes "Short      " (11 chars).
        
        expect(row1).toContain("Short      ");
        expect(row1).not.toContain("Short      :"); // No colon
        // RESET width is 7 ("22h 30m"). "1h" is 2 chars. Padding 5.
        // So "1h     ".
        expect(row1).toContain("1h     "); 
        
        expect(row2).toContain("Longer Name");
        expect(row2).toContain("22h 30m");
    });

    test("handles optional columns", () => {
        const quotas: QuotaData[] = [
            {
                id: "1",
                providerName: "A",
                used: 50,
                limit: 100,
                unit: "%",
                window: "5h",
            },
            {
                id: "2",
                providerName: "B",
                used: 50,
                limit: 100,
                unit: "%",
            },
        ];

        const rows = renderQuotaTable(quotas, {
            tableConfig: { columns: ["name", "window"] }
        });
        
        // rows[2] is first data row
        expect(rows[2].line).toContain("5h");
        expect(rows[2].line).toContain("A");
        // B has empty window, so it should be just spaces or end of line
        expect(rows[3].line).toContain("B");
    });

    test("aligns unlimited quotas", () => {
         const quotas: QuotaData[] = [
            {
                id: "1",
                providerName: "Limited",
                used: 50,
                limit: 100,
                unit: "%",
                reset: "in 1h",
            },
            {
                id: "2",
                providerName: "Unlimited",
                used: 0,
                limit: null,
                unit: "credits",
                reset: "never",
            },
        ];
        
        const rows = renderQuotaTable(quotas, {
            tableConfig: { columns: ["name", "bar", "reset"] }
        });
        
        // rows[3] is second data row
        expect(rows[3].line).toContain("Unlimited");
        expect(rows[3].line).not.toContain("[Unlimited]");
        // "never" is kept as is because it doesn't start with "in "
        expect(rows[3].line).toContain("never");
    });
    
    test("renders ETTL column", () => {
         const quotas: QuotaData[] = [
            {
                id: "1",
                providerName: "P1",
                used: 50,
                limit: 100,
                unit: "%",
                reset: "in 1h",
                predictedReset: "in 30m (predicted)"
            },
        ];
        
        const rows = renderQuotaTable(quotas, {
            tableConfig: { columns: ["name", "reset", "ettl"] }
        });
        
        expect(rows[0].line).toContain("ETTL"); // Header
        expect(rows[2].line).toContain("30m"); // Value stripped
        expect(rows[2].line).not.toContain("(predicted)");
    });

    test("normalizes names by replacing underscores with spaces", () => {
        const quotas: QuotaData[] = [
            {
                id: "1",
                providerName: "Antigravity_chat_20706",
                used: 50,
                limit: 100,
                unit: "%",
            },
        ];

        const rows = renderQuotaTable(quotas, {
            tableConfig: { columns: ["name"] }
        });

        expect(rows[2].line).toContain("Antigravity chat 20706");
        expect(rows[2].line).not.toContain("_");
    });
});
