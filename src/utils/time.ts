export function formatRelativeTime(targetDate: Date): string {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  if (diffMs <= 0) return "now";

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;
  const remainingMins = diffMins % 60;

  if (diffDays > 0) {
    return `${diffDays}d ${remainingHours}h`;
  }
  if (diffHours > 0) {
    return `${diffHours}h ${remainingMins}m`;
  }
  return `${diffMins}m`;
}

export function formatDurationMs(ms: number): string {
    if (ms <= 0) return "now";
    
    const diffMins = Math.floor(ms / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    const remainingMins = diffMins % 60;

    if (diffDays > 0) {
        return `${diffDays}d ${remainingHours}h`;
    }
    if (diffHours > 0) {
        return `${diffHours}h ${remainingMins}m`;
    }
    if (diffMins > 0) {
        return `${diffMins}m`;
    }
    return "less than 1m";
}
