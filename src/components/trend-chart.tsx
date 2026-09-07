"use client";

function TrendChart({ points }: { points: Array<{ date: string; score: number }> }) {
  if (points.length < 2) return null;

  const width = 320;
  const height = 110;
  const padding = 16;
  const xFor = (index: number) =>
    padding + (index * (width - padding * 2)) / (points.length - 1);
  const yFor = (score: number) =>
    height - padding - (score / 100) * (height - padding * 2);
  const line = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)},${yFor(point.score).toFixed(1)}`,
    )
    .join(" ");
  const latest = points[points.length - 1].score;

  return (
    <div className="animate-rise-in rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs tracking-widest text-white/50">近期评分趋势</span>
        <span className="rounded-full border border-amber-200/20 bg-amber-200/10 px-2 py-0.5 text-xs text-amber-200/90">
          最新 {latest}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="近期评分趋势图"
      >
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1"
        />
        <polyline
          points={line}
          fill="none"
          stroke="rgba(253, 230, 138, 0.85)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((point, index) => (
          <circle key={index} cx={xFor(index)} cy={yFor(point.score)} r="2.6" fill="#fde68a" />
        ))}
        <text x={padding} y={height - 4} className="fill-white/40 text-[9px]">
          {points[0].date}
        </text>
        <text
          x={width - padding}
          y={height - 4}
          textAnchor="end"
          className="fill-white/40 text-[9px]"
        >
          {points[points.length - 1].date}
        </text>
      </svg>
    </div>
  );
}

export { TrendChart };
