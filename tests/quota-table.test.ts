import { expect, test, describe } from "bun:test";
import { renderQuotaTable } from "../src/ui/quota-table";
import { type QuotaData } from "../src/interfaces";

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
        
        // "Longer Name" is 11 chars.
        // "Short" is 5 chars.
        // "Short" should be padded to 11.
        
        const row1 = rows[0].line;
        const row2 = rows[1].line;

        // name + ":" + " " + reset + " " + info
        expect(row1).toContain("Short      :");
        expect(row1).toContain("in 1h      ");
        expect(row2).toContain("Longer Name:");
        expect(row2).toContain("in 22h 30m ");
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
        
        expect(rows[0].line).toContain("5h");
        expect(rows[0].line).toContain("A:");
        expect(rows[1].line.trim()).toBe("B:"); // window is empty for B
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
        
        expect(rows[1].line).toContain("Unlimited");
        expect(rows[1].line).not.toContain("[Unlimited]");
        expect(rows[1].line).toContain("never");
    });
});
