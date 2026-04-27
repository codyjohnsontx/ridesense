type FormFitnessCurveProps = {
  ctl: number[];
  atl: number[];
  tsb: number[];
  w?: number;
  h?: number;
};

export function FormFitnessCurve({ ctl, atl, tsb, w = 720, h = 220 }: FormFitnessCurveProps) {
  const padL = 28;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const allPos = [...ctl, ...atl];
  const yMax = Math.max(...allPos, 1) * 1.1;
  const tsbMax = Math.max(...tsb.map((v) => Math.abs(v)), 1) * 1.2;
  const xAt = (i: number, n: number) => padL + (i / Math.max(1, n - 1)) * innerW;
  const yAt = (v: number) => padT + innerH - (v / yMax) * innerH;
  const tsbAxisY = padT + innerH * 0.78;
  const tsbY = (v: number) => tsbAxisY - (v / tsbMax) * (innerH * 0.18);

  const pathFor = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i, arr.length).toFixed(1)} ${yAt(v).toFixed(1)}`).join(" ");
  const tsbPath = tsb
    .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i, tsb.length).toFixed(1)} ${tsbY(v).toFixed(1)}`)
    .join(" ");

  const ticks = [0, 25, 50, 75, 100].filter((t) => t <= yMax);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: "block" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={w - padR} y1={yAt(t)} y2={yAt(t)} stroke="hsl(var(--border))" strokeWidth="1" opacity="0.5" />
          <text
            x={padL - 6}
            y={yAt(t) + 3}
            fontSize="10"
            textAnchor="end"
            fill="hsl(var(--muted-foreground))"
            className="mono"
            opacity="0.7"
          >
            {t}
          </text>
        </g>
      ))}
      <line
        x1={padL}
        x2={w - padR}
        y1={tsbAxisY}
        y2={tsbAxisY}
        stroke="hsl(var(--border))"
        strokeDasharray="2 3"
        strokeWidth="1"
      />
      <path d={pathFor(atl)} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.2" strokeLinejoin="round" />
      <path d={pathFor(ctl)} fill="none" stroke="hsl(var(--foreground))" strokeWidth="2" strokeLinejoin="round" />
      <path
        d={tsbPath}
        fill="none"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="1"
        strokeDasharray="1 2"
      />
      {ctl.length > 0 ? (
        <>
          <line
            x1={xAt(ctl.length - 1, ctl.length)}
            x2={xAt(ctl.length - 1, ctl.length)}
            y1={padT}
            y2={padT + innerH}
            stroke="hsl(var(--foreground))"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.5"
          />
          <circle
            cx={xAt(ctl.length - 1, ctl.length)}
            cy={yAt(ctl[ctl.length - 1])}
            r="3.5"
            fill="hsl(var(--foreground))"
          />
        </>
      ) : null}
      <text x={padL} y={h - 6} fontSize="10" fill="hsl(var(--muted-foreground))" className="mono" opacity="0.7">
        12W AGO
      </text>
      <text x={w - padR} y={h - 6} fontSize="10" textAnchor="end" fill="hsl(var(--muted-foreground))" className="mono" opacity="0.7">
        TODAY
      </text>
    </svg>
  );
}

export function WeeklyLoadChart({
  weekly,
  w = 360,
  h = 110,
  highlight = -1
}: {
  weekly: Array<{ load: number }>;
  w?: number;
  h?: number;
  highlight?: number;
}) {
  if (weekly.length === 0) return null;
  const padL = 4;
  const padR = 4;
  const padT = 8;
  const padB = 18;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const max = Math.max(...weekly.map((d) => d.load), 1);
  const bw = innerW / weekly.length;
  const avg = weekly.reduce((a, b) => a + b.load, 0) / weekly.length;
  const avgY = padT + innerH - (avg / max) * innerH;
  const hi = highlight < 0 ? weekly.length - 1 : highlight;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: "block" }}>
      <line
        x1={padL}
        x2={w - padR}
        y1={avgY}
        y2={avgY}
        stroke="hsl(var(--muted-foreground))"
        strokeDasharray="2 3"
        strokeWidth="1"
        opacity="0.6"
      />
      <text
        x={w - padR - 2}
        y={avgY - 3}
        fontSize="9"
        fill="hsl(var(--muted-foreground))"
        textAnchor="end"
        className="mono"
        opacity="0.7"
      >
        AVG {Math.round(avg)}
      </text>
      {weekly.map((d, i) => {
        const bh = (d.load / max) * innerH;
        const x = padL + i * bw + 1;
        const y = padT + innerH - bh;
        const isHi = i === hi;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={Math.max(1, bw - 2)}
              height={bh}
              fill={isHi ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
              opacity={isHi ? 1 : 0.55}
            />
            {isHi ? (
              <text
                x={x + (bw - 2) / 2}
                y={y - 4}
                fontSize="9"
                textAnchor="middle"
                fill="hsl(var(--foreground))"
                className="mono"
              >
                {d.load}
              </text>
            ) : null}
          </g>
        );
      })}
      <text x={padL} y={h - 4} fontSize="9" fill="hsl(var(--muted-foreground))" className="mono" opacity="0.7">
        {weekly.length} WEEKS
      </text>
    </svg>
  );
}

export function ZoneStackBar({
  zones,
  h = 14
}: {
  zones: Array<{ key: string; load: number; pct: number }>;
  h?: number;
}) {
  const total = zones.reduce((a, b) => a + b.load, 0) || 1;
  return (
    <div
      style={{
        display: "flex",
        height: h,
        borderRadius: 2,
        overflow: "hidden",
        background: "hsl(var(--muted))"
      }}
    >
      {zones.map((z, i) => (
        <div
          key={z.key}
          title={`${z.key}: ${z.load} TSS`}
          style={{ flex: z.load / total, background: `hsl(var(--rs-z${i + 1}))` }}
        />
      ))}
    </div>
  );
}

export function WeekHeatmap({ daily, w = 360, h = 62 }: { daily: number[]; w?: number; h?: number }) {
  const weeks = Math.max(1, Math.ceil(daily.length / 7));
  const cell = Math.max(6, Math.floor(w / weeks) - 2);
  const max = Math.max(...daily, 1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: "block" }}>
      {daily.map((v, i) => {
        const wk = Math.floor(i / 7);
        const dow = i % 7;
        const op = v === 0 ? 0.08 : 0.25 + (v / max) * 0.75;
        return (
          <rect
            key={i}
            x={wk * (cell + 2)}
            y={dow * (cell * 0.8 + 1)}
            width={cell}
            height={cell * 0.8}
            rx="1.5"
            fill="hsl(var(--foreground))"
            opacity={op}
          />
        );
      })}
    </svg>
  );
}
