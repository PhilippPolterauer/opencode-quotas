import { describe, expect, test } from "bun:test";
import { PLUGIN_FOOTER_SIGNATURE } from "../../src/constants";
import { renderQuotaFooter } from "../../src/ui/footer";

describe("Quota footer rendering", () => {
    test("wraps the footer table in a fenced text block", () => {
        const footer = renderQuotaFooter(["line 1", "line 2"], {
            mode: "used",
        });

        expect(footer).toContain(`**${PLUGIN_FOOTER_SIGNATURE} (Used)**`);
        expect(footer).toContain("```text\nline 1\nline 2\n```");
    });

    test("can hide the title while keeping the fenced layout", () => {
        const footer = renderQuotaFooter(["line 1"], {
            mode: "available",
            showTitle: false,
        });

        expect(footer).not.toContain(PLUGIN_FOOTER_SIGNATURE);
        expect(footer).toContain("```text\nline 1\n```");
    });
});
