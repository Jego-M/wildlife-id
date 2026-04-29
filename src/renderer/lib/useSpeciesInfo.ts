import { useState, useEffect } from "react";
import type { WikipediaSummary } from "../../shared/types";

const cache = new Map<string, WikipediaSummary | null>();

export function useSpeciesInfo(scientificName: string | null) {
  const [info, setInfo] = useState<WikipediaSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!scientificName) {
      setInfo(null);
      setLoading(false);
      return;
    }

    if (cache.has(scientificName)) {
      setInfo(cache.get(scientificName) ?? null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    window.api.wiki.summary(scientificName).then(
      result => {
        if (cancelled) return;
        cache.set(scientificName, result);
        setInfo(result);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        cache.set(scientificName, null);
        setInfo(null);
        setLoading(false);
      },
    );

    return () => { cancelled = true; };
  }, [scientificName]);

  return { info, loading };
}
