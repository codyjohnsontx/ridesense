import { ALL_TIME_RANGE, PRESET_RANGES, customTimeRange, type PresetRange, type TimeRange } from "@/lib/api";

type SearchParamReader = {
  get(name: string): string | null;
};

const PRESET_VALUES = new Set<PresetRange>(["1m", "12w", "6mo", "1y", "2y"]);

export function parseTimeRange(params: SearchParamReader): TimeRange {
  const start = params.get("start");
  const end = params.get("end");
  if (start && end) {
    return customTimeRange(start, end);
  }

  const range = params.get("range");
  if (range === "all") {
    return ALL_TIME_RANGE;
  }
  if (range && PRESET_VALUES.has(range as PresetRange)) {
    return PRESET_RANGES[range as PresetRange];
  }
  return PRESET_RANGES["12w"];
}

export function applyTimeRangeToSearchParams(params: URLSearchParams, range: TimeRange) {
  params.delete("range");
  params.delete("start");
  params.delete("end");

  if (range.mode === "custom") {
    params.set("start", range.startDate);
    params.set("end", range.endDate);
    return;
  }

  if (range.mode === "all") {
    params.set("range", "all");
    return;
  }

  params.set("range", range.preset);
}

export function withTimeRange(pathname: string, range: TimeRange) {
  const params = new URLSearchParams();
  applyTimeRangeToSearchParams(params, range);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
