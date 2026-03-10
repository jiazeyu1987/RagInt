import { TourTemplateManager } from './TourTemplateManager';

describe('TourTemplateManager', () => {
  test('normalizeStops trims and filters invalid values', () => {
    expect(TourTemplateManager.normalizeStops([' A ', '', null, 'B'])).toEqual(['A', 'B']);
    expect(TourTemplateManager.normalizeStops(null)).toEqual([]);
  });

  test('mergeUniqueStops preserves order across lists', () => {
    const merged = TourTemplateManager.mergeUniqueStops(['A', 'B'], ['B', 'C'], ['A', 'D']);
    expect(merged).toEqual(['A', 'B', 'C', 'D']);
  });

  test('normalizeTemplateStops filters duplicate/disallowed rows and appends missing allowed stops', () => {
    const rows = TourTemplateManager.normalizeTemplateStops(
      [
        { name: 'A', enabled: false, duration_s: 0 },
        { name: 'A', enabled: true, duration_s: 90 },
        { name: 'C', enabled: true, duration_s: 200 },
      ],
      ['A', 'B']
    );

    expect(rows).toEqual([
      { name: 'A', enabled: false, duration_s: 1 },
      { name: 'B', enabled: true, duration_s: TourTemplateManager.DEFAULT_STOP_DURATION_S },
    ]);
  });

  test('clampDuration keeps values in [1, 3600]', () => {
    expect(TourTemplateManager.clampDuration(0)).toBe(1);
    expect(TourTemplateManager.clampDuration(5000)).toBe(3600);
    expect(TourTemplateManager.clampDuration(120)).toBe(120);
    expect(TourTemplateManager.clampDuration('x', 99)).toBe(99);
  });

  test('ensureTemplates creates default template when list is empty', () => {
    const result = TourTemplateManager.ensureTemplates({
      templates: [],
      allStops: ['S1', 'S2'],
      selectedTemplateId: '',
    });

    expect(result.created).toBe(true);
    expect(result.templates).toHaveLength(1);
    expect(result.selectedTemplateId).toBe(result.templates[0].id);
    expect(result.templates[0].stops.map((x) => x.name)).toEqual(['S1', 'S2']);
  });

  test('upsertSelectedTemplate updates and normalizes selected template', () => {
    const result = TourTemplateManager.upsertSelectedTemplate({
      templates: [{ id: 't1', name: 'base', stops: [{ name: 'A', enabled: true, duration_s: 30 }] }],
      selectedTemplateId: 't1',
      allStops: ['A'],
      updater: (tpl) => ({
        ...tpl,
        name: 'updated',
        stops: [{ name: 'A', enabled: false, duration_s: 222 }],
      }),
    });

    expect(result.selectedTemplateId).toBe('t1');
    expect(result.templates[0]).toEqual({
      id: 't1',
      name: 'updated',
      stops: [{ name: 'A', enabled: false, duration_s: 222 }],
    });
  });

  test('deleteTemplate removes selected template and picks next one', () => {
    const result = TourTemplateManager.deleteTemplate({
      templates: [
        { id: 'a', name: 'A', stops: [] },
        { id: 'b', name: 'B', stops: [] },
      ],
      selectedTemplateId: 'a',
      allStops: [],
    });

    expect(result.templates.map((x) => x.id)).toEqual(['b']);
    expect(result.selectedTemplateId).toBe('b');
  });

  test('buildOverrides includes enabled stops and clamped durations', () => {
    const result = TourTemplateManager.buildOverrides({
      stops: [
        { name: 'A', enabled: true, duration_s: 12.4 },
        { name: 'B', enabled: false, duration_s: 99 },
        { name: 'C', enabled: true, duration_s: 0 },
      ],
    });

    expect(result.enabledStops).toEqual(['A', 'C']);
    expect(result.durationMap).toEqual({
      A: 12,
      C: 1,
    });
  });
});

