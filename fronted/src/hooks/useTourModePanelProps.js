import { useMemo } from 'react';

export function useTourModePanelProps({
  tourMode,
  setTourMode,
  tourTemplates,
  tourTemplateId,
  setTourTemplateId,
  tourStopsOverride,
  setTourStopsOverride,
  setTourZone,
} = {}) {
  return useMemo(
    () => ({
      tourMode,
      onChangeTourMode: setTourMode,
      templates: tourTemplates,
      tourTemplateId,
      onChangeTourTemplateId: setTourTemplateId,
      tourStopsOverride,
      onChangeTourStopsOverride: setTourStopsOverride,
      onApplyTemplateZone: (z) => setTourZone(z),
    }),
    [setTourMode, setTourTemplateId, setTourStopsOverride, setTourZone, tourMode, tourStopsOverride, tourTemplateId, tourTemplates]
  );
}
