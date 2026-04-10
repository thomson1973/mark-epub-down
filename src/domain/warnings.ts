import type { WarningRecord } from "./types";

type WarningVisibility = "cli" | "structured-only";

const WARNING_VISIBILITY: Record<string, WarningVisibility> = {
  ELEMENTS_DROPPED: "structured-only",
};

export class WarningCollector {
  private readonly warnings: WarningRecord[] = [];

  public add(code: string, message: string): void {
    this.warnings.push({ code, message });
  }

  public list(): WarningRecord[] {
    return [...this.warnings];
  }
}

export function getCliVisibleWarnings(warnings: WarningRecord[]): WarningRecord[] {
  return warnings.filter((warning) => getWarningVisibility(warning.code) === "cli");
}

export function summarizeWarnings(warnings: WarningRecord[]): WarningRecord[] {
  const counts = new Map<string, { warning: WarningRecord; count: number }>();

  for (const warning of warnings) {
    const key = `${warning.code}\u0000${warning.message}`;
    const existing = counts.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(key, {
      warning,
      count: 1,
    });
  }

  return [...counts.values()].map(({ warning, count }) => {
    if (count === 1) {
      return warning;
    }

    return {
      code: warning.code,
      message: `${warning.message} (${count} occurrences)`,
    };
  });
}

function getWarningVisibility(code: string): WarningVisibility {
  return WARNING_VISIBILITY[code] ?? "cli";
}
