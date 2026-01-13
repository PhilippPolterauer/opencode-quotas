import { expect, test, describe } from "bun:test";
import { formatRelativeTime, formatDurationMs } from "../../src/utils/time";

describe("time utils", () => {
  describe("formatRelativeTime", () => {
    test("returns 'now' for past dates", () => {
      const past = new Date(Date.now() - 1000);
      expect(formatRelativeTime(past)).toBe("now");
    });

    test("returns 'now' for current date", () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe("now");
    });

    test("formats minutes correctly", () => {
      const future = new Date(Date.now() + 5 * 60 * 1000 + 500);
      expect(formatRelativeTime(future)).toBe("5m");
    });

    test("formats hours and minutes correctly", () => {
      const future = new Date(Date.now() + (2 * 60 + 15) * 60 * 1000 + 500);
      expect(formatRelativeTime(future)).toBe("2h 15m");
    });

    test("formats days and hours correctly", () => {
      const future = new Date(Date.now() + (3 * 24 + 5) * 60 * 60 * 1000 + 500);
      expect(formatRelativeTime(future)).toBe("3d 5h");
    });
  });

  describe("formatDurationMs", () => {
    test("returns 'now' for zero or negative duration", () => {
      expect(formatDurationMs(0)).toBe("now");
      expect(formatDurationMs(-1000)).toBe("now");
    });

    test("returns 'less than 1m' for small durations", () => {
      expect(formatDurationMs(30 * 1000)).toBe("less than 1m");
    });

    test("formats minutes correctly", () => {
      expect(formatDurationMs(5 * 60 * 1000)).toBe("5m");
    });

    test("formats hours and minutes correctly", () => {
      expect(formatDurationMs((2 * 60 + 15) * 60 * 1000)).toBe("2h 15m");
    });

    test("formats days and hours correctly", () => {
      expect(formatDurationMs((3 * 24 + 5) * 60 * 60 * 1000)).toBe("3d 5h");
    });
  });
});
