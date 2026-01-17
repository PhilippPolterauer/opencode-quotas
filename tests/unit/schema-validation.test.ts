import { expect, test, describe } from "bun:test";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../../schemas/quotas.schema.json";
import { type QuotaConfig } from "../../src/interfaces";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

describe("Schema Validation", () => {
    test("validates empty config", () => {
        const config: Partial<QuotaConfig> = {};
        const valid = validate(config);
        expect(valid).toBe(true);
    });

    test("validates full valid config", () => {
        const config: QuotaConfig = {
            displayMode: "detailed",
            progressBar: {
                width: 40,
                filledChar: "█",
                emptyChar: "░",
                show: "available",
                color: true,
                gradients: [
                    { threshold: 0.5, color: "yellow" },
                    { threshold: 0.8, color: "red" }
                ]
            },
            table: {
                columns: ["name", "bar", "percent", "reset"],
                header: true
            },
            footer: true,
            showFooterTitle: true,
            disabled: ["quota-1", "quota-2"],
            filterByCurrentModel: true,
            debug: true,
            enableExperimentalGithub: true,
            aggregatedGroups: [
                {
                    id: "group-1",
                    name: "Group 1",
                    sources: ["q1", "q2"],
                    patterns: ["*flash*"],
                    strategy: "mean",
                    predictionWindowMinutes: 30
                }
            ],
            historyMaxAgeHours: 48,
            pollingInterval: 30000,
            predictionShortWindowMinutes: 10,
            showUnaggregated: false
        };
        const valid = validate(config);
        expect(valid).toBe(true);
    });

    test("rejects invalid displayMode", () => {
        const config = {
            displayMode: "invalid-mode"
        };
        const valid = validate(config);
        expect(valid).toBe(false);
        expect(validate.errors?.[0].message).toContain("must be equal to one of the allowed values");
    });

    test("rejects invalid progressBar width", () => {
        const config = {
            progressBar: {
                width: 0
            }
        };
        const valid = validate(config);
        expect(valid).toBe(false);
        expect(validate.errors?.[0].message).toContain("must be >= 1");
    });

    test("rejects missing required fields in aggregatedGroups", () => {
        const config = {
            aggregatedGroups: [
                {
                    id: "only-id"
                }
            ]
        };
        const valid = validate(config);
        expect(valid).toBe(false);
        expect(validate.errors?.[0].message).toContain("must have required property 'name'");
    });

    test("rejects invalid aggregation strategy", () => {
        const config = {
            aggregatedGroups: [
                {
                    id: "g1",
                    name: "G1",
                    strategy: "invalid-strategy"
                }
            ]
        };
        const valid = validate(config);
        expect(valid).toBe(false);
        expect(validate.errors?.[0].message).toContain("must be equal to one of the allowed values");
    });

    test("rejects invalid gradient threshold", () => {
        const config = {
            progressBar: {
                gradients: [
                    { threshold: 1.5, color: "red" }
                ]
            }
        };
        const valid = validate(config);
        expect(valid).toBe(false);
        expect(validate.errors?.[0].message).toContain("must be <= 1");
    });

    test("rejects invalid color in gradients", () => {
        const config = {
            progressBar: {
                gradients: [
                    { threshold: 0.5, color: "not-a-color" }
                ]
            }
        };
        const valid = validate(config);
        expect(valid).toBe(false);
        expect(validate.errors?.[0].message).toContain("must be equal to one of the allowed values");
    });

    test("rejects invalid column name in table", () => {
        const config = {
            table: {
                columns: ["invalid-column"]
            }
        };
        const valid = validate(config);
        expect(valid).toBe(false);
        expect(validate.errors?.[0].message).toContain("must be equal to one of the allowed values");
    });

    test("validates minimal aggregatedGroup", () => {
        const config = {
            aggregatedGroups: [
                {
                    id: "min-id",
                    name: "Min Name"
                }
            ]
        };
        const valid = validate(config);
        expect(valid).toBe(true);
    });

    test("rejects wrong types", () => {
        const config = {
            footer: "not-a-boolean",
            historyMaxAgeHours: "not-a-number"
        };
        const valid = validate(config);
        expect(valid).toBe(false);
        expect(validate.errors?.length).toBeGreaterThanOrEqual(2);
    });
});
