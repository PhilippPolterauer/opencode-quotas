export interface QuotaData {
  id: string; // Unique identifier (e.g., "codex-primary", "ag-flash")
  providerName: string; // Display name
  used: number;
  limit: number | null;
  unit: string;
  details?: string;
}

export interface QuotaGroup {
  name: string;
  patterns: string[];
}

export interface QuotaConfig {
  displayMode: QuotaDisplayMode;
  progressBar?: ProgressBarConfig;
  /**
   * Whether to show quotas in the chat footer automatically.
   * Defaults to true.
   */
  footer?: boolean;
  /**
   * Optional grouping definitions per provider ID.
   */
  groups?: Record<string, QuotaGroup[]>;
  /**
   * List of quota IDs to hide from display.
   */
  disabled?: string[];
  /**
   * Maps a model identifier (e.g., "antigravity:gemini-1.5-flash") to a list
   * of relevant quota IDs. If provided, the plugin will only show these
   * quotas for that model.
   */
  modelMapping?: Record<string, string[]>;
  /**
   * Enable debug logging to ~/.local/share/opencode/quotas-debug.log
   */
  debug?: boolean;
}

export interface IQuotaProvider {
  id: string;
  fetchQuota(): Promise<QuotaData[]>;
}

export interface IQuotaRegistry {
  register(provider: IQuotaProvider): void;
  getAll(): IQuotaProvider[];
}

export type QuotaDisplayMode = "simple" | "detailed" | "hidden";

export type AnsiColor =
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray"
  | "reset";

export interface GradientLevel {
  threshold: number; // 0 to 1 (e.g., 0.8 for 80%)
  color: AnsiColor;
}

export interface ProgressBarConfig {
  width?: number;
  filledChar?: string;
  emptyChar?: string;
  show?: "used" | "available";
  /**
   * Disable ANSI colors regardless of gradient configuration.
   */
  noColor?: boolean;
  // Define color levels. The bar will use the color of the first level
  // whose threshold is greater than or equal to the current usage ratio.
  gradients?: GradientLevel[];
}

