import { expect, test, describe } from "bun:test";
import { renderQuotaTable } from "../src/ui/quota-table";
import { type QuotaData } from "../src/interfaces";

describe("Quota Table Rendering", () => {
    test("aligns detail columns", () => {
        const quotas: QuotaData[] = [
            {
                id: "1",
                providerName: "Short",
                used: 50,
                limit: 100,
                unit: "%",
                details: "Short | Detail 2",
            },
            {
                id: "2",
                providerName: "Longer",
                used: 50,
                limit: 100,
                unit: "%",
                details: "Longer Column | Detail 2",
            },
        ];

        const rows = renderQuotaTable(quotas, {});
        
        // "Longer Column" is 13 chars.
        // "Short" is 5 chars.
        // "Short" should be padded to 13.
        
        const row1 = rows[0].line;
        const row2 = rows[1].line;

        expect(row1).toContain("Short         | Detail 2");
        expect(row2).toContain("Longer Column | Detail 2");
    });

    test("handles mixed column counts", () => {
        const quotas: QuotaData[] = [
            {
                id: "1",
                providerName: "A",
                used: 50,
                limit: 100,
                unit: "%",
                details: "Col 1",
            },
            {
                id: "2",
                providerName: "B",
                used: 50,
                limit: 100,
                unit: "%",
                details: "Column 1 Is Long | Col 2",
            },
        ];

        const rows = renderQuotaTable(quotas, {});
        
        // Row 1 Col 1 is the last segment in its row, so it is NOT padded.
        expect(rows[0].line).toContain("Col 1");
        expect(rows[0].line).not.toContain("Col 1            "); 
    });

    test("aligns unlimited quotas", () => {
         const quotas: QuotaData[] = [
            {
                id: "1",
                providerName: "Limited",
                used: 50,
                limit: 100,
                unit: "%",
                details: "Limited Col 1 | Rest",
            },
            {
                id: "2",
                providerName: "Unlimited",
                used: 0,
                limit: null,
                unit: "credits",
                details: "Unlim",
            },
        ];
        
        const rows = renderQuotaTable(quotas, {});
        // "Limited Col 1" len 13.
        // "Unlim" len 5.
        // Row 2 has 1 col. Not padded.
        expect(rows[1].line).toContain("(Unlimited) | Unlim");
        
        // What if Unlimited had 2 cols?
         const quotas2: QuotaData[] = [
            {
                id: "1",
                providerName: "Limited",
                used: 50,
                limit: 100,
                unit: "%",
                details: "Short | Rest",
            },
            {
                id: "2",
                providerName: "Unlimited",
                used: 0,
                limit: null,
                unit: "credits",
                details: "Longer First Col | Rest",
            },
        ];
        
        const rows2 = renderQuotaTable(quotas2, {});
        // "Short" should be padded to match "Longer First Col"
        expect(rows2[0].line).toContain("Short            | Rest");
    });
});
