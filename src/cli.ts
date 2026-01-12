#!/usr/bin/env bun
import { QuotaService } from "./services/quota-service";
import { HistoryService } from "./services/history-service";
import { renderQuotaTable } from "./ui/quota-table";

async function main() {
    if (process.argv.includes("--no-color")) {
        process.env.OPENCODE_QUOTAS_NO_COLOR = "1";
    }

    const historyService = new HistoryService();
    await historyService.init();

    const quotaService = new QuotaService();
    await quotaService.init(process.cwd(), historyService);

    const config = quotaService.getConfig();
    const filteredResults = await quotaService.getQuotas();

    if (filteredResults.length === 0) {
        console.log("No active quotas found.");
        return;
    }

    console.log(""); // Empty line
    console.log("📊 OpenCode Quotas");
    console.log("------------------");

    renderQuotaTable(filteredResults, {
        progressBarConfig: config.progressBar,
        tableConfig: config.table,
    }).forEach((row) => {
        console.log(row.line);
    });
    console.log(""); // Empty line
}

main().catch(console.error);
