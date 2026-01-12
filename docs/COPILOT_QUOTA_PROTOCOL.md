> **Status: Archived / Not Currently Pursued**
> This protocol investigation is currently paused and not being actively implemented.

# Copilot Quota Extraction Protocol

This document describes the protocol for extracting Copilot subscription, quota, and premium usage information.

## 1. Authentication Context

OpenCode stores Copilot credentials in `auth.json` under the `github-copilot` key.

### Credential Schema (OAuth)

- **type**: `oauth`
- **refresh**: The long-lived GitHub User token (`ghu_...`).
- **access**: The short-lived Copilot session token (`tid=...`).

## 2. Capability Quota Protocol (Session)

Used to check immediate access rights and "Limited User" caps (e.g. Free Tier capabilities).

- **Endpoint**: `GET https://api.github.com/copilot_internal/v2/token`
- **Headers**:
  - `Authorization`: `Bearer <ghu_token>`
  - `User-Agent`: `GitHubCopilotChat/0.35.0`
- **Response**:
  - `limited_user_quotas`: Object containing specific limits if applicable (often null for standard plans).
  - `sku`: The user's plan (e.g. `free_engaged_oss_quota`).

## 3. Premium Usage Protocol (Billing)

**Status: Restricted / Internal Only**

Attempts to access granular billing usage (e.g. "42% of premium requests used") via public REST APIs have proven unsuccessful for individual users, even with elevated permissions.

- **Target Endpoint**: `GET https://api.github.com/users/{username}/settings/billing/usage`
- **Observation**: Returns `404 Not Found` for individual accounts, even with `read:user` and billing scopes. This endpoint appears to be restricted to Organizations or Enterprise accounts.

### Conclusion

The detailed usage percentage seen in VS Code is likely retrieved via:

1.  **Internal API**: An undocumented endpoint on `api.githubcopilot.com`.
2.  **GraphQL**: A specific query not exposed in public schema.
3.  **Telemetry**: Calculated client-side or pushed via the completion stream headers.

For OpenCode integration, reliance should be placed on the **Capability Quota Protocol** (Section 2) to determine plan status (`sku`) and hard limits (`limited_user_quotas`), as this is the only reliably accessible data source.
