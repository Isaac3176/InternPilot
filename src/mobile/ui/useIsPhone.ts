import { useEffect, useState } from "react";

// Portrait phones (<=767px) plus landscape phones (short + touch), while
// keeping tablets and touch laptops on the desktop layout.
const QUERY = "(max-width: 767px), (max-height: 500px) and (pointer: coarse)";

/** True on phone-sized viewports. Reacts to rotation / resize. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setPhone(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return phone;
}
