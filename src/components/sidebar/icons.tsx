import type { SVGProps } from "react";

// Shared defaults; callers (and CSS) can override size/stroke.
function svg(props: SVGProps<SVGSVGElement>) {
  return { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...props };
}

export function HomeIcon(p: SVGProps<SVGSVGElement>) {
  return <svg {...svg(p)}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1z" /></svg>;
}
export function SearchIcon(p: SVGProps<SVGSVGElement>) {
  return <svg {...svg(p)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>;
}
export function ListIcon(p: SVGProps<SVGSVGElement>) {
  return <svg {...svg(p)}><path d="M4 6h16M4 12h16M4 18h10" /></svg>;
}
export function DocIcon(p: SVGProps<SVGSVGElement>) {
  return <svg {...svg(p)}><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /></svg>;
}
export function ChatIcon(p: SVGProps<SVGSVGElement>) {
  return <svg {...svg(p)}><path d="M21 12a8 8 0 01-11.4 7.2L4 20.5l1.3-5.4A8 8 0 1121 12z" /></svg>;
}
