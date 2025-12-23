import { useEffect } from 'react';
import { fetchJson } from '../api/backendClient';

export function useTourBootstrap({
  setTourMeta,
  setTourZone,
  setAudienceProfile,
  setTourStops,
  setTourSelectedStopIndex,
} = {}) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await fetchJson('/api/tour/meta');
        if (cancelled) return;
        if (meta && typeof meta === 'object') {
          if (typeof setTourMeta === 'function') setTourMeta(meta);
          const zones = Array.isArray(meta.zones) ? meta.zones : [];
          const profiles = Array.isArray(meta.profiles) ? meta.profiles : [];
          if (typeof setTourZone === 'function') {
            setTourZone((prev) => (prev ? prev : String(meta.default_zone || zones[0] || '默认路线')));
          }
          if (typeof setAudienceProfile === 'function') {
            setAudienceProfile((prev) => (prev ? prev : String(meta.default_profile || profiles[0] || '大众')));
          }
        }

        const data = await fetchJson('/api/tour/stops');
        if (cancelled) return;
        const stops = Array.isArray(data && data.stops)
          ? data.stops
              .map((s) => String(s || '').trim())
              .filter(Boolean)
          : [];
        if (typeof setTourStops === 'function') setTourStops(stops);
        if (stops.length && typeof setTourSelectedStopIndex === 'function') {
          setTourSelectedStopIndex((prev) => {
            const n = Number(prev);
            if (!Number.isFinite(n)) return 0;
            return Math.max(0, Math.min(n, stops.length - 1));
          });
        }
      } catch (_) {
        if (!cancelled && typeof setTourStops === 'function') setTourStops([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setTourMeta, setTourZone, setAudienceProfile, setTourStops, setTourSelectedStopIndex]);
}

