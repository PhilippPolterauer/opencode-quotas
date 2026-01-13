import { expect, test, describe } from "bun:test";
import { isValidNumber, clamp, validatePollingInterval, validateQuotaData } from "../../src/utils/validation";

describe("validation utils", () => {
  describe("isValidNumber", () => {
    test("returns true for finite numbers", () => {
      expect(isValidNumber(0)).toBe(true);
      expect(isValidNumber(100)).toBe(true);
      expect(isValidNumber(-5.5)).toBe(true);
    });

    test("returns false for non-numbers", () => {
      expect(isValidNumber("123")).toBe(false);
      expect(isValidNumber(null)).toBe(false);
      expect(isValidNumber(undefined)).toBe(false);
      expect(isValidNumber({})).toBe(false);
    });

    test("returns false for Infinity and NaN", () => {
      expect(isValidNumber(Infinity)).toBe(false);
      expect(isValidNumber(-Infinity)).toBe(false);
      expect(isValidNumber(NaN)).toBe(false);
    });
  });

  describe("clamp", () => {
    test("returns value if within range", () => {
      expect(clamp(50, 0, 100)).toBe(50);
    });

    test("returns min if value is below range", () => {
      expect(clamp(-10, 0, 100)).toBe(0);
    });

    test("returns max if value is above range", () => {
      expect(clamp(150, 0, 100)).toBe(100);
    });

    test("handles undefined max", () => {
      expect(clamp(150, 0)).toBe(150);
      expect(clamp(-10, 0)).toBe(0);
    });

    test("returns min if value is not finite", () => {
      expect(clamp(Infinity, 0, 100)).toBe(0);
      expect(clamp(NaN, 10, 100)).toBe(10);
    });
  });

  describe("validatePollingInterval", () => {
    test("returns number for valid inputs", () => {
      expect(validatePollingInterval(1000)).toBe(1000);
      expect(validatePollingInterval("2000")).toBe(2000);
      expect(validatePollingInterval("  3000  ")).toBe(3000);
    });

    test("returns null for invalid inputs", () => {
      expect(validatePollingInterval(null)).toBe(null);
      expect(validatePollingInterval(undefined)).toBe(null);
      expect(validatePollingInterval(0)).toBe(null);
      expect(validatePollingInterval(-100)).toBe(null);
      expect(validatePollingInterval("abc")).toBe(null);
    });
  });

  describe("validateQuotaData", () => {
    test("validates complete quota data", () => {
      const input = {
        id: "q1",
        providerName: "P1",
        used: 50,
        limit: 100,
        unit: "tokens",
        reset: "1h",
      };
      const validated = validateQuotaData(input);
      expect(validated).toEqual({
        id: "q1",
        providerName: "P1",
        used: 50,
        limit: 100,
        unit: "tokens",
        reset: "1h",
        predictedReset: undefined,
        window: undefined,
        info: undefined,
        details: undefined,
      });
    });

    test("returns null if id or providerName is missing", () => {
      expect(validateQuotaData({ id: "q1" })).toBe(null);
      expect(validateQuotaData({ providerName: "P1" })).toBe(null);
    });

    test("handles missing used or limit", () => {
      const input = { id: "q1", providerName: "P1" };
      const validated = validateQuotaData(input);
      expect(validated?.used).toBe(0);
      expect(validated?.limit).toBe(null);
    });

    test("handles invalid used value", () => {
      expect(validateQuotaData({ id: "q1", providerName: "P1", used: -10 })?.used).toBe(0);
      expect(validateQuotaData({ id: "q1", providerName: "P1", used: "abc" })?.used).toBe(0);
    });

    test("handles explicit null limit", () => {
      expect(validateQuotaData({ id: "q1", providerName: "P1", limit: null })?.limit).toBe(null);
    });

    test("returns null for non-object input", () => {
      expect(validateQuotaData(null)).toBe(null);
      expect(validateQuotaData(123)).toBe(null);
    });
  });
});
