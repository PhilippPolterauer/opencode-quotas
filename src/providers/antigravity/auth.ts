import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * PUBLIC OAUTH CREDENTIALS - INTENTIONALLY COMMITTED
 * 
 * These are "Installed Application" credentials for Google's Native App OAuth flow.
 * Per Google's documentation, the client_secret for native applications is NOT
 * considered confidential. Security relies solely on the user's refresh_token
 * stored locally in ~/.config/opencode/antigravity-accounts.json.
 * 
 * See: https://developers.google.com/identity/protocols/oauth2/native-app
 */
const ANTIGRAVITY_CLIENT_ID =
  "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"; // gitleaks:allow
const ANTIGRAVITY_CLIENT_SECRET = "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"; // gitleaks:allow
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface StoredAccount {
  email: string;
  refreshToken: string;
  projectId?: string;
  managedProjectId?: string;
  addedAt: number;
  lastUsed: number;
}

interface AccountsFile {
  version: number;
  accounts: StoredAccount[];
  activeIndex: number;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface CloudAuthCredentials {
  accessToken: string;
  projectId?: string;
  email: string;
}

interface CachedCredential extends CloudAuthCredentials {
  expiresAt: number;
}

let cachedCredential: CachedCredential | null = null;

function getAccountsFilePath(): string {
  return join(homedir(), ".config", "opencode", "antigravity-accounts.json");
}

async function loadAccounts(): Promise<AccountsFile> {
  const accountsPath = getAccountsFilePath();

  try {
    const content = await readFile(accountsPath, "utf-8");
    const data = JSON.parse(content) as AccountsFile;

    if (!data.accounts || data.accounts.length === 0) {
      throw new Error("No accounts found in antigravity-accounts.json");
    }

    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "Antigravity accounts file not found.\n" +
          "Run 'opencode auth login' first to authenticate with Google.",
      );
    }
    throw error;
  }
}

export async function hasCloudCredentials(): Promise<boolean> {
  try {
    await loadAccounts();
    return true;
  } catch {
    return false;
  }
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.toLowerCase().includes("invalid_grant")) {
      throw new Error(
        "Refresh token is invalid or expired. Run 'opencode auth login' to re-authenticate.",
      );
    }
    throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as TokenResponse;
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function getCloudCredentials(): Promise<CloudAuthCredentials> {
  const accountsFile = await loadAccounts();
  const activeAccount =
    accountsFile.accounts[accountsFile.activeIndex] ?? accountsFile.accounts[0];

  if (!activeAccount) {
    throw new Error("No active account found in antigravity-accounts.json");
  }

  // Check cache (5 min buffer)
  const fiveMinutesInMs = 5 * 60 * 1000;
  if (
    cachedCredential &&
    cachedCredential.email === activeAccount.email &&
    cachedCredential.expiresAt > Date.now() + fiveMinutesInMs
  ) {
    return {
      accessToken: cachedCredential.accessToken,
      projectId: cachedCredential.projectId,
      email: cachedCredential.email,
    };
  }

  const { accessToken, expiresAt } = await refreshAccessToken(activeAccount.refreshToken);
  
  cachedCredential = {
    accessToken,
    projectId: activeAccount.projectId,
    email: activeAccount.email,
    expiresAt,
  };

  return {
    accessToken,
    projectId: activeAccount.projectId,
    email: activeAccount.email,
  };
}
