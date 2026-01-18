import { expect, test, describe, spyOn, afterEach } from "bun:test";
import { createCodexProvider } from "../../src/providers/codex";

describe("Live Codex Provider (File Reading)", () => {
  afterEach(() => {
    // Restore fetch if we mocked it
  });

  test("reads local auth.json and attempts fetch", async () => {
    const provider = createCodexProvider();

    // Mock fetch to avoid actual network call
    const mockFetch = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          rate_limit: {
            primary_window: { used_percent: 10 },
          },
        }),
        { status: 200 },
      ),
    );

    const result = await provider.fetchQuota();

    expect(mockFetch).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].providerName).toBe("Codex Primary");

    const callArgs = mockFetch.mock.calls[0];
    const url = callArgs[0] as string;
    expect(url).toContain("/backend-api/wham/usage");

    mockFetch.mockRestore();
  });
});
