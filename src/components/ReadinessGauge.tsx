function band(v: number): string {
  return v >= 80 ? "var(--beacon)" : v >= 55 ? "var(--amber)" : "var(--alert)";
}
function verdictOf(v: number): string {
  return v >= 80 ? "Strong fit" : v >= 65 ? "Good fit" : v >= 45 ? "Fair fit" : "Reach";
}

/** Analog readiness gauge (SVG) showing a 0-100 profile match. */
export default function ReadinessGauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const arc = Math.PI * 61;
  const dash = ((arc * v) / 100).toFixed(1);
  const angle = v * 1.8 - 90;
  const color = band(v);

  const ticks = Array.from({ length: 11 }, (_, k) => {
    const a = Math.PI - (k / 10) * Math.PI;
    const r1 = k % 5 === 0 ? 58 : 63;
    const r2 = 68;
    const x1 = 90 + r1 * Math.cos(a);
    const y1 = 92 - r1 * Math.sin(a);
    const x2 = 90 + r2 * Math.cos(a);
    const y2 = 92 - r2 * Math.sin(a);
    return (
      <line
        key={k}
        x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)}
        stroke={k % 5 === 0 ? "#B7C2CC" : "#DDE3E9"}
        strokeWidth={k % 5 === 0 ? 1.6 : 1.1}
        strokeLinecap="round"
      />
    );
  });

  return (
    <div className="gauge">
      <svg viewBox="0 0 180 116" role="img" aria-label={`Readiness ${v} out of 100`}>
        {ticks}
        <path d="M29 92 A 61 61 0 0 1 151 92" fill="none" stroke="#E7ECF0" strokeWidth="9" strokeLinecap="round" />
        <path
          d="M29 92 A 61 61 0 0 1 151 92"
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${arc.toFixed(1)}`}
        />
        <g style={{ transformBox: "fill-box", transformOrigin: "50% 100%", transform: `rotate(${angle}deg)`, transition: "transform .9s cubic-bezier(.2,.9,.25,1)" }}>
          <path d="M89 46 L91 46 L90.6 90 L89.4 90 Z" fill="#0D1621" />
        </g>
        <circle cx="90" cy="92" r="5.5" fill="#0D1621" />
        <circle cx="90" cy="92" r="2" fill="#F3B24E" />
      </svg>
      <div className="readout"><b>{v}</b><small>/100</small></div>
      <div className="verdict" style={{ color }}>{verdictOf(v)}</div>
    </div>
  );
}
