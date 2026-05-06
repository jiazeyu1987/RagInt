import { useEffect, useRef } from 'react';
import { fetchJson } from '../api/backendClient';

export function useTourBootstrap({
  setTourMeta,
  setTourZone,
  setAudienceProfile,
  setTourStops,
  setTourSelectedStopIndex,
  onTourBootstrapError,
} = {}) {
  const startedRef = useRef(false);
  const settersRef = useRef({
    setTourMeta,
    setTourZone,
    setAudienceProfile,
    setTourStops,
    setTourSelectedStopIndex,
    onTourBootstrapError,
  });

  useEffect(() => {
    settersRef.current = {
      setTourMeta,
      setTourZone,
      setAudienceProfile,
      setTourStops,
      setTourSelectedStopIndex,
      onTourBootstrapError,
    };
  }, [onTourBootstrapError, setAudienceProfile, setTourMeta, setTourSelectedStopIndex, setTourStops, setTourZone]);

  useEffect(() => {
    if (startedRef.current) return () => {};
    startedRef.current = true;

    let cancelled = false;
    const reportBootstrapError = ({ source, error }) => {
      const nextSetters = settersRef.current || {};
      if (!cancelled && typeof nextSetters.onTourBootstrapError === 'function') {
        nextSetters.onTourBootstrapError({ source, error });
      }
    };

    (async () => {
      let meta = null;
      try {
        meta = await fetchJson('/api/tour/meta');
      } catch (error) {
        reportBootstrapError({ source: '/api/tour/meta', error });
        return;
      }
      if (cancelled) return;
      if (meta && typeof meta === 'object') {
        const nextSetters = settersRef.current || {};
        if (typeof nextSetters.setTourMeta === 'function') nextSetters.setTourMeta(meta);
        const zones = Array.isArray(meta.zones) ? meta.zones : [];
        const profiles = Array.isArray(meta.profiles) ? meta.profiles : [];
        if (typeof nextSetters.setTourZone === 'function') {
          nextSetters.setTourZone((prev) => (prev ? prev : String(meta.default_zone || zones[0] || '默认路线')));
        }
        if (typeof nextSetters.setAudienceProfile === 'function') {
          nextSetters.setAudienceProfile((prev) => (prev ? prev : String(meta.default_profile || profiles[0] || '大众')));
        }
      }

      let data = null;
      try {
        data = await fetchJson('/api/tour/stops');
      } catch (error) {
        reportBootstrapError({ source: '/api/tour/stops', error });
        return;
      }
      if (cancelled) return;
      const stops = Array.isArray(data && data.stops)
        ? data.stops
            .map((s) => String(s || '').trim())
            .filter(Boolean)
        : [];

      const nextSetters = settersRef.current || {};
      if (typeof nextSetters.setTourStops === 'function') nextSetters.setTourStops(stops);
      if (stops.length && typeof nextSetters.setTourSelectedStopIndex === 'function') {
        nextSetters.setTourSelectedStopIndex((prev) => {
          const n = Number(prev);
          if (!Number.isFinite(n)) return 0;
          return Math.max(0, Math.min(n, stops.length - 1));
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
