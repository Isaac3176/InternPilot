import { useEffect, useMemo, useState } from "react";
import { companyDomain, isLogosOn, logoUrls } from "../listings/logo";

const LOGO_COLORS = [
  "#1F6FEB", "#7C5CFF", "#157F5F", "#B03D2A", "#A9761C",
  "#12509E", "#3E4C8C", "#4B4FD6", "#33383D", "#D6455E",
];
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return LOGO_COLORS[h % LOGO_COLORS.length];
}
function initialsFor(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/**
 * Company avatar: a Clearbit logo when logos are enabled and a domain can be
 * guessed, otherwise (or on load failure) a colored monogram. Reuses the
 * existing `.logo` styles so sizing matches wherever it's dropped in.
 */
export default function CompanyLogo({ company, className }: { company: string; className?: string }) {
  const domain = useMemo(() => companyDomain(company), [company]);
  const urls = useMemo(() => (domain ? logoUrls(domain) : []), [domain]);
  const [idx, setIdx] = useState(0);

  // Restart from the first source when the company (domain) changes.
  useEffect(() => setIdx(0), [domain]);

  const showImg = isLogosOn() && idx < urls.length;
  const cls = "logo" + (showImg ? " img" : "") + (className ? ` ${className}` : "");

  if (showImg) {
    return (
      <div className={cls}>
        <img src={urls[idx]} alt="" loading="lazy" onError={() => setIdx((i) => i + 1)} />
      </div>
    );
  }
  return <div className={cls} style={{ background: colorFor(company) }}>{initialsFor(company)}</div>;
}
