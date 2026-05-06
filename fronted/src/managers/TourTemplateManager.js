export class TourTemplateManager {
  static DEFAULT_STOP_DURATION_S = 120;

  static assertPlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(`${label} must be a plain object`);
    }
  }

  static assertString(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new TypeError(`${label} must be a non-empty string`);
    }
  }

  static assertNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`${label} must be a finite number`);
    }
  }

  static normalizeStops(list) {
    return Array.isArray(list)
      ? list.map((s) => String(s || '').trim()).filter(Boolean)
      : [];
  }

  static mergeUniqueStops(...lists) {
    const seen = new Set();
    const out = [];
    for (const list of lists) {
      for (const name of TourTemplateManager.normalizeStops(list)) {
        if (!name || seen.has(name)) continue;
        seen.add(name);
        out.push(name);
      }
    }
    return out;
  }

  static extractTemplateStops(templates) {
    const out = [];
    for (const tpl of Array.isArray(templates) ? templates : []) {
      const rows = tpl && Array.isArray(tpl.stops) ? tpl.stops : [];
      for (const row of rows) {
        const name = String((row && row.name) || '').trim();
        if (name) out.push(name);
      }
    }
    return TourTemplateManager.normalizeStops(out);
  }

  static clampDuration(value, fallback = TourTemplateManager.DEFAULT_STOP_DURATION_S) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.min(3600, Math.round(n)));
  }

  static normalizeTemplateStops(stops, allStops = []) {
    if (!Array.isArray(stops)) {
      throw new TypeError('template stops must be an array');
    }
    const allowList = TourTemplateManager.normalizeStops(allStops);
    const allowSet = allowList.length ? new Set(allowList) : null;
    const seen = new Set();
    const kept = [];
    for (const row of stops) {
      TourTemplateManager.assertPlainObject(row, 'template stop');
      TourTemplateManager.assertString(row.name, 'template stop name');
      if ('enabled' in row && typeof row.enabled !== 'boolean') {
        throw new TypeError('template stop enabled must be a boolean');
      }
      if (!('duration_s' in row)) {
        throw new TypeError('template stop duration_s is required');
      }
      TourTemplateManager.assertNumber(row.duration_s, 'template stop duration_s');
      const name = row.name.trim();
      if (seen.has(name)) continue;
      if (allowSet && !allowSet.has(name)) continue;
      seen.add(name);
      kept.push({
        name,
        enabled: row.enabled !== false,
        duration_s: TourTemplateManager.clampDuration(row.duration_s),
      });
    }
    if (allowSet) {
      for (const name of allowList) {
        if (seen.has(name)) continue;
        kept.push({
          name,
          enabled: true,
          duration_s: TourTemplateManager.DEFAULT_STOP_DURATION_S,
        });
      }
    }
    return kept;
  }

  static normalizeTemplate(template, allStops = [], index = 0) {
    TourTemplateManager.assertPlainObject(template, 'template');
    TourTemplateManager.assertString(template.id, 'template id');
    TourTemplateManager.assertString(template.name, 'template name');
    const t = template && typeof template === 'object' ? template : {};
    const id = String(t.id || '').trim() || `guide_tpl_auto_${index + 1}`;
    const name = String(t.name || '').trim() || `模板${index + 1}`;
    return {
      id,
      name,
      stops: TourTemplateManager.normalizeTemplateStops(t.stops, allStops),
    };
  }

  static normalizeTemplates(templates, allStops = []) {
    if (!Array.isArray(templates)) {
      throw new TypeError('templates must be an array');
    }
    return templates
      .map((tpl, i) => TourTemplateManager.normalizeTemplate(tpl, allStops, i))
      .filter(Boolean);
  }

  static selectTemplate(templates, selectedTemplateId) {
    if (!Array.isArray(templates)) {
      throw new TypeError('templates must be an array');
    }
    if (!templates.length) return null;
    const id = String(selectedTemplateId || '').trim();
    if (!id) return templates[0];
    return templates.find((tpl) => String((tpl && tpl.id) || '').trim() === id) || templates[0];
  }

  static createTemplate({ allStops = [], name = '新模板', id } = {}) {
    const templateId = String(id || '').trim() || `guide_tpl_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const templateName = String(name || '').trim() || '新模板';
    return {
      id: templateId,
      name: templateName,
      stops: TourTemplateManager.normalizeStops(allStops).map((stopName) => ({
        name: stopName,
        enabled: true,
        duration_s: TourTemplateManager.DEFAULT_STOP_DURATION_S,
      })),
    };
  }

  static ensureTemplates({ templates = [], allStops = [], selectedTemplateId = '' } = {}) {
    const normalized = TourTemplateManager.normalizeTemplates(templates, allStops);
    if (!normalized.length) {
      const first = TourTemplateManager.createTemplate({ allStops, name: '模板1' });
      return { templates: [first], selectedTemplate: first, selectedTemplateId: first.id, created: true };
    }
    const selected = TourTemplateManager.selectTemplate(normalized, selectedTemplateId) || normalized[0];
    return { templates: normalized, selectedTemplate: selected, selectedTemplateId: selected ? selected.id : '', created: false };
  }

  static upsertSelectedTemplate({
    templates = [],
    selectedTemplateId = '',
    allStops = [],
    updater,
  } = {}) {
    const normalized = TourTemplateManager.normalizeTemplates(templates, allStops);
    if (!normalized.length) return { templates: normalized, selectedTemplateId: '' };
    const selected = TourTemplateManager.selectTemplate(normalized, selectedTemplateId) || normalized[0];
    const selectedId = String((selected && selected.id) || '').trim();
    const idx = normalized.findIndex((tpl) => String((tpl && tpl.id) || '').trim() === selectedId);
    if (idx < 0) return { templates: normalized, selectedTemplateId: selectedId };
    const base = normalized[idx];
    const nextRaw = typeof updater === 'function' ? updater(base) : base;
    const next = TourTemplateManager.normalizeTemplate(nextRaw, allStops, idx);
    const out = [...normalized];
    out[idx] = next;
    return { templates: out, selectedTemplateId: next.id };
  }

  static deleteTemplate({ templates = [], selectedTemplateId = '', allStops = [] } = {}) {
    const normalized = TourTemplateManager.normalizeTemplates(templates, allStops);
    if (normalized.length <= 1) {
      const only = normalized[0] || null;
      return { templates: normalized, selectedTemplateId: only ? only.id : '' };
    }
    const selected = TourTemplateManager.selectTemplate(normalized, selectedTemplateId) || normalized[0];
    const selectedId = String((selected && selected.id) || '').trim();
    const remain = normalized.filter((tpl) => String((tpl && tpl.id) || '').trim() !== selectedId);
    const nextSelected = remain[0] || null;
    return { templates: remain, selectedTemplateId: nextSelected ? nextSelected.id : '' };
  }

  static buildOverrides(selectedTemplate) {
    const enabledStops = [];
    const durationMap = {};
    if (!selectedTemplate) {
      return { enabledStops, durationMap };
    }
    TourTemplateManager.assertPlainObject(selectedTemplate, 'selected template');
    if (!Array.isArray(selectedTemplate.stops)) {
      throw new TypeError('selected template stops must be an array');
    }
    const rows = selectedTemplate.stops;
    for (const row of rows) {
      TourTemplateManager.assertPlainObject(row, 'selected template stop');
      TourTemplateManager.assertString(row.name, 'selected template stop name');
      if ('enabled' in row && typeof row.enabled !== 'boolean') {
        throw new TypeError('selected template stop enabled must be a boolean');
      }
      if (!('duration_s' in row)) {
        throw new TypeError('selected template stop duration_s is required');
      }
      TourTemplateManager.assertNumber(row.duration_s, 'selected template stop duration_s');
      const name = row.name.trim();
      if (row.enabled === false) continue;
      enabledStops.push(name);
      durationMap[name] = TourTemplateManager.clampDuration(row.duration_s);
    }
    return { enabledStops, durationMap };
  }
}
