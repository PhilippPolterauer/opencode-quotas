import { expect, test, describe, beforeEach } from "bun:test";
import { getQuotaRegistry } from "../../src/registry";
import { type IQuotaProvider } from "../../src/interfaces";

describe("QuotaRegistry", () => {
  beforeEach(() => {
    // Clear the registry between tests by reaching into global state
    // (This is a bit hacky but necessary for singleton testing)
    const REGISTRY_KEY = "__OPENCODE_QUOTA_REGISTRY__";
    delete (globalThis as any)[REGISTRY_KEY];
  });

  test("returns the same instance (singleton)", () => {
    const r1 = getQuotaRegistry();
    const r2 = getQuotaRegistry();
    expect(r1).toBe(r2);
  });

  test("can register and retrieve providers", () => {
    const registry = getQuotaRegistry();
    const provider: IQuotaProvider = {
      id: "test-p1",
      fetchQuota: async () => [],
    };

    registry.register(provider);
    const providers = registry.getAll();
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe("test-p1");
  });

  test("prevents duplicate registration of the same provider ID", () => {
    const registry = getQuotaRegistry();
    const p1: IQuotaProvider = {
      id: "p1",
      fetchQuota: async () => [],
    };
    const p2: IQuotaProvider = {
      id: "p1", // Same ID
      fetchQuota: async () => [],
    };

    registry.register(p1);
    registry.register(p2);

    const providers = registry.getAll();
    expect(providers).toHaveLength(1);
  });
});
