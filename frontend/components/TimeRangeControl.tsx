"use client";

import { useEffect, useMemo, useState } from "react";
import { ALL_TIME_RANGE, customTimeRange, PRESET_RANGES, type PresetRange, type TimeRange } from "@/lib/api";
import { Input, Tabs } from "./ui";

function dateInputValue(date: Date) {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return copy.toISOString().slice(0, 10);
}

function daysAgoInputValue(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return dateInputValue(date);
}

function rangeControlValue(range: TimeRange) {
  if (range.mode === "preset") return range.preset;
  return range.mode;
}

export function TimeRangeControl({ range, onChange }: { range: TimeRange; onChange: (next: TimeRange) => void }) {
  const defaultStart = useMemo(() => daysAgoInputValue(27), []);
  const defaultEnd = useMemo(() => dateInputValue(new Date()), []);
  const [draftStart, setDraftStart] = useState(range.mode === "custom" ? range.startDate : defaultStart);
  const [draftEnd, setDraftEnd] = useState(range.mode === "custom" ? range.endDate : defaultEnd);
  const customInvalid = Boolean(draftStart && draftEnd && draftStart > draftEnd);

  useEffect(() => {
    if (range.mode === "custom") {
      setDraftStart(range.startDate);
      setDraftEnd(range.endDate);
    }
  }, [range]);

  const applyCustom = (start: string, end: string) => {
    if (!start || !end || start > end) return;
    onChange(customTimeRange(start, end));
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Tabs
        value={rangeControlValue(range)}
        ariaLabel="Training range"
        onChange={(value) => {
          if (value === "all") {
            onChange(ALL_TIME_RANGE);
          } else if (value === "custom") {
            applyCustom(draftStart, draftEnd);
          } else {
            onChange(PRESET_RANGES[value as PresetRange]);
          }
        }}
        options={[
          { value: "1m", label: "1m" },
          { value: "12w", label: "12w" },
          { value: "6mo", label: "6m" },
          { value: "1y", label: "1y" },
          { value: "2y", label: "2y" },
          { value: "all", label: "All" },
          { value: "custom", label: "Custom" }
        ]}
      />
      {range.mode === "custom" ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Input
            type="date"
            value={draftStart}
            onChange={(event) => {
              const next = event.target.value;
              setDraftStart(next);
              applyCustom(next, draftEnd);
            }}
            className="w-[142px] px-2"
            aria-label="Custom range start date"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={draftEnd}
            onChange={(event) => {
              const next = event.target.value;
              setDraftEnd(next);
              applyCustom(draftStart, next);
            }}
            className="w-[142px] px-2"
            aria-label="Custom range end date"
          />
          {customInvalid ? <span className="text-xs text-[hsl(var(--destructive))]">Invalid range</span> : null}
        </div>
      ) : null}
    </div>
  );
}
