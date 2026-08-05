"use client";

import { useEffect, useState } from "react";

/** SSR-safe matchMedia subscription; defaults to `false` until mounted. */
export function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [query]);

  return matches;
}

export const MOBILE_EDITOR_QUERY = "(max-width: 767px)";

export function useIsMobileEditor(): boolean {
  return useMatchMedia(MOBILE_EDITOR_QUERY);
}
