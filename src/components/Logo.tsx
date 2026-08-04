/**
 * InternPilot "Ascent" mark — two climbing chevrons (pilot rank insignia crossed
 * with an upward trend). AscentMark uses currentColor for flexible placement;
 * AscentIcon is the boxed gradient app-icon for standalone brand moments.
 */

export function AscentMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path d="M4.6 25.4 16 14l11.4 11.4" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.34" />
      <path d="M10.4 9.6 16 4l5.6 5.6" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AscentIcon({ size = 30, radius = 7 }: { size?: number; radius?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="ascent-icon-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B85F5" />
          <stop offset="1" stopColor="#1A5BC4" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx={radius} fill="url(#ascent-icon-grad)" />
      <g transform="translate(16 16) scale(.66) translate(-16 -16)">
        <path d="M4.6 25.4 16 14l11.4 11.4" fill="none" stroke="#fff" opacity=".5" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.4 9.6 16 4l5.6 5.6" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export default AscentMark;
