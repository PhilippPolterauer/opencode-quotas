export interface QuotaData {
  id: string; // Unique identifier (e.g., "codex-primary", "ag-flash")
  providerName: string; // Display name
  used: number;
  limit: number | null;
  unit: string;
  
  /**
   * Reset time description (e.g. "in 2h 41m" or "at 12:00").
   */
  reset?: string;
  
  /**
   * Predicted time until limit is reached (e.g. "in 12m (predicted)").
   */
  predictedReset?: string;
  
  /**
   * Window or period description (e.g. "5h window" or "Monthly").
   */
  window?: string;

  /**
   * Extra information or alerts (e.g. "!!" or "unlimited").
   */
  info?: string;

  /**
   * @deprecated Use reset, window, info instead.
   */
  details?: string;
}

export interface QuotaGroup {
  name: string;
  patterns: string[];
}


export type QuotaColumn = 
  | "name" 
  | "bar" 
  | "percent" 
  | "value" 
  | "reset" 
  | "window" 
  | "info"
  | "status"
  | "ettl";

export interface QuotaConfig {
  displayMode: QuotaDisplayMode;
  progressBar?: ProgressBarConfig;
  table?: {
      /**
       * Columns to display in the quota table.
       * Defaults to a smart selection based on data.
       */
      columns?: QuotaColumn[];
  };
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
  /**
   * Optional aggregation groups.
   */
  aggregatedGroups?: AggregatedGroup[];
  /**
   * Max history age in hours. Defaults to 24.
   */
  historyMaxAgeHours?: number;
}

export type AggregationStrategy = 
  | "most_critical" // Predicted time-to-limit (requires history)
  | "min"           // Lowest percentage used
  | "max"           // Highest percentage used
  | "mean"          // Average percentage used
  | "median";       // Median percentage used

export interface AggregatedGroup {
    id: string;              // Unique ID for the smart group (e.g. "codex-smart")
    name: string;            // Display name (e.g. "Codex Usage")
    sources: string[];       // IDs of quotas to track (e.g. ["codex-primary", "codex-secondary"])
    strategy?: AggregationStrategy; // Defaults to "most_critical"
    predictionWindowMinutes?: number; // Time window for regression (default: 60)
}

export interface HistoryPoint {
    timestamp: number;
    used: number;
    limit: number | null;
}

export interface IHistoryService {
    init(): Promise<void>;
    append(snapshot: QuotaData[]): Promise<void>;
    getHistory(quotaId: string, windowMs: number): HistoryPoint[];
    setMaxAge(hours: number): void;
    pruneAll(): Promise<void>;
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
  | "bold"
  | "dim"
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
   * Enable ANSI colors. Defaults to false.
   */
  color?: boolean;
  // Define color levels. The bar will use the color of the first level
  // whose threshold is greater than or equal to the current usage ratio.
  gradients?: GradientLevel[];
}

