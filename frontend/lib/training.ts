import type { DashboardResponse } from "./api";

export function buildZoneRows(zones: DashboardResponse["analysis"]["category_breakdown"]) {
  const entries = Object.entries(zones);
  const total = entries.reduce((sum, [, value]) => sum + value.load, 0) || 1;
  return entries.map(([key, value]) => ({
    key,
    load: value.load,
    count: value.count,
    pct: Math.round((value.load / total) * 100)
  }));
}
