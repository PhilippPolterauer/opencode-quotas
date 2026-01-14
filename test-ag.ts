import { createAntigravityProvider } from "./src/providers/antigravity";

async function test() {
  console.log(
    "Testing Antigravity Cloud Quota Retrieval with Custom Groups...",
  );
  try {
    const provider = createAntigravityProvider({ debug: true });
    const quotas = await provider.fetchQuota();
    console.log("Retrieved Grouped Quotas:");
    console.log(JSON.stringify(quotas, null, 2));
  } catch (e) {
    console.error("Failed to retrieve quotas:", e);
  }
}

test();
