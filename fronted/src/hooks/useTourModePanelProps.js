import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchJson } from '../api/backendClient';
import { TourTemplateManager } from '../managers/TourTemplateManager';

export function useTourModePanelProps({
  tourGuideTemplates,
  setTourGuideTemplates,
  tourGuideTemplateId,
  setTourGuideTemplateId,
  tourStops,
  setTourStopsOverride,
  setTourStopDurationsOverride,
} = {}) {
  const [catalogStops, setCatalogStops] = useState([]);
  const runtimeStops = useMemo(() => TourTemplateManager.normalizeStops(tourStops), [tourStops]);
  const rawTemplates = useMemo(() => (Array.isArray(tourGuideTemplates) ? tourGuideTemplates : []), [tourGuideTemplates]);
  const templateStops = useMemo(() => TourTemplateManager.extractTemplateStops(rawTemplates), [rawTemplates]);
  const allStops = useMemo(
    () => TourTemplateManager.mergeUniqueStops(catalogStops, runtimeStops, templateStops),
    [catalogStops, runtimeStops, templateStops]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson('/api/tour/stops');
        if (cancelled) return;
        const stops = TourTemplateManager.normalizeStops(data && data.stops);
        if (stops.length) setCatalogStops(stops);
      } catch (_) {
        if (!cancelled) setCatalogStops((prev) => (Array.isArray(prev) ? prev : []));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedTemplates = useMemo(
    () => TourTemplateManager.normalizeTemplates(rawTemplates, allStops),
    [allStops, rawTemplates]
  );
  const rawSig = useMemo(() => JSON.stringify(rawTemplates), [rawTemplates]);
  const normalizedSig = useMemo(() => JSON.stringify(normalizedTemplates), [normalizedTemplates]);

  const selectedTemplate = useMemo(() => {
    return TourTemplateManager.selectTemplate(normalizedTemplates, tourGuideTemplateId);
  }, [normalizedTemplates, tourGuideTemplateId]);

  useEffect(() => {
    if (!allStops.length || typeof setTourGuideTemplates !== 'function') return;
    const ensured = TourTemplateManager.ensureTemplates({
      templates: rawTemplates,
      allStops,
      selectedTemplateId: tourGuideTemplateId,
    });
    if (ensured.created) {
      setTourGuideTemplates(ensured.templates);
      if (typeof setTourGuideTemplateId === 'function') setTourGuideTemplateId(ensured.selectedTemplateId);
      return;
    }
    if (rawSig !== normalizedSig) setTourGuideTemplates(normalizedTemplates);
  }, [
    allStops,
    normalizedSig,
    normalizedTemplates,
    rawSig,
    rawTemplates,
    tourGuideTemplateId,
    setTourGuideTemplateId,
    setTourGuideTemplates,
  ]);

  useEffect(() => {
    if (!selectedTemplate || typeof setTourGuideTemplateId !== 'function') return;
    if (String(tourGuideTemplateId || '').trim() !== selectedTemplate.id) {
      setTourGuideTemplateId(selectedTemplate.id);
    }
  }, [selectedTemplate, setTourGuideTemplateId, tourGuideTemplateId]);

  useEffect(() => {
    if (!selectedTemplate) return;
    const { enabledStops, durationMap } = TourTemplateManager.buildOverrides(selectedTemplate);
    if (typeof setTourStopsOverride === 'function') setTourStopsOverride(enabledStops);
    if (typeof setTourStopDurationsOverride === 'function') setTourStopDurationsOverride(durationMap);
  }, [selectedTemplate, setTourStopDurationsOverride, setTourStopsOverride]);

  const updateSelectedTemplate = useCallback(
    (updater) => {
      if (typeof setTourGuideTemplates !== 'function' || !selectedTemplate) return;
      setTourGuideTemplates((prev) => {
        const result = TourTemplateManager.upsertSelectedTemplate({
          templates: Array.isArray(prev) ? prev : [],
          selectedTemplateId: selectedTemplate.id,
          allStops,
          updater,
        });
        return result.templates;
      });
    },
    [allStops, selectedTemplate, setTourGuideTemplates]
  );

  const onChangeTemplateId = useCallback(
    (id) => {
      if (typeof setTourGuideTemplateId !== 'function') return;
      setTourGuideTemplateId(String(id || '').trim());
    },
    [setTourGuideTemplateId]
  );

  const onCreateTemplate = useCallback(() => {
    if (typeof setTourGuideTemplates !== 'function') return;
    const nextId = `guide_tpl_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const nextName = `模板${Math.max(1, normalizedTemplates.length + 1)}`;
    const nextTemplate = TourTemplateManager.createTemplate({ allStops, name: nextName, id: nextId });
    setTourGuideTemplates((prev) => {
      const src = TourTemplateManager.normalizeTemplates(Array.isArray(prev) ? prev : [], allStops);
      return [...src, nextTemplate];
    });
    if (typeof setTourGuideTemplateId === 'function') setTourGuideTemplateId(nextId);
  }, [allStops, normalizedTemplates.length, setTourGuideTemplateId, setTourGuideTemplates]);

  const onDeleteSelectedTemplate = useCallback(() => {
    if (!selectedTemplate || typeof setTourGuideTemplates !== 'function') return;
    const result = TourTemplateManager.deleteTemplate({
      templates: normalizedTemplates,
      selectedTemplateId: selectedTemplate.id,
      allStops,
    });
    setTourGuideTemplates(result.templates);
    if (typeof setTourGuideTemplateId === 'function') {
      setTourGuideTemplateId(result.selectedTemplateId);
    }
  }, [allStops, normalizedTemplates, selectedTemplate, setTourGuideTemplateId, setTourGuideTemplates]);

  const onSaveSelectedTemplate = useCallback(
    (nextTemplate) => {
      if (!nextTemplate || typeof nextTemplate !== 'object') return;
      updateSelectedTemplate((tpl) => ({
        ...tpl,
        name: String(nextTemplate.name || tpl.name || '').trim() || tpl.name,
        stops: Array.isArray(nextTemplate.stops) ? nextTemplate.stops : tpl.stops,
      }));
    },
    [updateSelectedTemplate]
  );

  return useMemo(
    () => ({
      templates: normalizedTemplates,
      selectedTemplateId: selectedTemplate ? selectedTemplate.id : '',
      selectedTemplate,
      onChangeTemplateId,
      onCreateTemplate,
      onDeleteSelectedTemplate,
      onSaveSelectedTemplate,
    }),
    [
      normalizedTemplates,
      onChangeTemplateId,
      onCreateTemplate,
      onDeleteSelectedTemplate,
      onSaveSelectedTemplate,
      selectedTemplate,
    ]
  );
}
