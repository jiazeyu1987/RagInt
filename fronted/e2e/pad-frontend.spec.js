const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe.configure({ mode: 'serial' });

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
};

const MOCK_AUDIO_PATH = path.join(__dirname, 'fixtures', 'tone.wav');
const MOCK_AUDIO_BYTES = fs.readFileSync(MOCK_AUDIO_PATH);

const MOCK_IMAGE_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+b3X8AAAAASUVORK5CYII=',
  'base64'
);

const DEFAULT_DISPLAY = Object.freeze({
  display_id: 'display_pad_a',
  display_name: 'Display A',
  slot_station_ids: ['station_entrance', 'station_second'],
});

function analyzeMockAudio(bytes) {
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  let nonZeroCount = 0;
  for (let index = 44; index < payload.length; index += 2) {
    if (payload[index] !== 0 || payload[index + 1] !== 0) {
      nonZeroCount += 1;
      if (nonZeroCount > 32) break;
    }
  }
  return {
    byteLength: payload.length,
    nonZeroCount,
  };
}

function createBaseFixture() {
  return {
    display: {
      ...DEFAULT_DISPLAY,
      updated_at_ms: 1710000000000,
    },
    hall: {
      hall_id: 'hall_01',
      hall_name: '心内介植入展厅',
      updated_at_ms: 1710000000000,
    },
    products: [
      {
        product_id: 'product_001',
        hall_id: 'hall_01',
        sort_order: 1,
        product_name: '造影导管',
        product_name_en: 'Angiography Catheter',
        intro_text: '造影导管介绍',
        registration_name: '造影导管注册证',
        registration_number: 'REG-001',
        effective_date: '2026-01-01',
        company: '瑛泰',
        current_audio: {
          audio_asset_id: 'audio_001',
          source_type: 'recorded',
          text_snapshot: '造影导管默认讲解',
          updated_at_ms: 1710000000100,
        },
        images: [{ image_asset_id: 'image_001', mimetype: 'image/png', updated_at_ms: 1710000000150 }],
      },
      {
        product_id: 'product_002',
        hall_id: 'hall_01',
        sort_order: 2,
        product_name: '亲水涂层造影导管',
        product_name_en: 'Hydrophilic Angiography Catheter',
        intro_text: '亲水涂层造影导管介绍',
        registration_name: '亲水涂层造影导管注册证',
        registration_number: 'REG-002',
        effective_date: '2026-01-02',
        company: '瑛泰',
        current_audio: {
          audio_asset_id: 'audio_002',
          source_type: 'tts',
          text_snapshot: '亲水涂层造影导管默认 TTS 讲解',
          updated_at_ms: 1710000000200,
        },
        images: [{ image_asset_id: 'image_002', mimetype: 'image/png', updated_at_ms: 1710000000250 }],
      },
      {
        product_id: 'product_003',
        hall_id: 'hall_01',
        sort_order: 3,
        product_name: '压力传感器',
        product_name_en: 'Pressure Transducer',
        intro_text: '压力传感器介绍',
        registration_name: '压力传感器注册证',
        registration_number: 'REG-003',
        effective_date: '2026-01-03',
        company: '瑛泰',
        current_audio: null,
        images: [],
      },
    ],
    recordings: {
      recording_station_a: {
        recording_id: 'recording_station_a',
        display_name: '站点 A 讲解',
        created_at_ms: 1710000001000,
        finished_at_ms: 1710000002000,
        stops: ['入口介绍', '器械说明'],
        metadata: {},
      },
      recording_station_b: {
        recording_id: 'recording_station_b',
        display_name: '站点 B 讲解',
        created_at_ms: 1710000003000,
        finished_at_ms: 1710000004000,
        stops: ['第二站介绍'],
        metadata: {},
      },
    },
    stations: {
      station_a: {
        station_id: 'station_entrance',
        slot_key: 'display_slot_1',
        station_key: 'station_a',
        label: '入口站点',
        recording_id: 'recording_station_a',
        stop_index: 0,
        stop_name: '入口介绍',
        background_enabled: true,
        wireframe_enabled: true,
        background_updated_at_ms: 1710000010000,
        wireframe_updated_at_ms: 1710000010000,
        base_width: 1024,
        base_height: 768,
        hotspots: [
          {
            hotspot_id: 'station_hotspot_control_switch_a',
            product_id: '__control_toggle_station__',
            control_action: 'toggle_station',
            control_label: '站台切换',
            sort_order: -400,
            x_pct: 0.02,
            y_pct: 0.05,
            width_pct: 0.08,
            height_pct: 0.18,
            updated_at_ms: 1710000010001,
          },
          {
            hotspot_id: 'station_hotspot_control_station_a',
            product_id: '__control_toggle_station_narration__',
            control_action: 'toggle_station_narration',
            control_label: '全站讲解',
            sort_order: -399,
            x_pct: 0.02,
            y_pct: 0.27,
            width_pct: 0.08,
            height_pct: 0.2,
            updated_at_ms: 1710000010002,
          },
          {
            hotspot_id: 'station_hotspot_control_ops_a',
            product_id: '__control_enter_ops__',
            control_action: 'enter_ops',
            control_label: '运维',
            sort_order: -398,
            x_pct: 0.02,
            y_pct: 0.52,
            width_pct: 0.08,
            height_pct: 0.14,
            updated_at_ms: 1710000010003,
          },
          {
            hotspot_id: 'station_hotspot_control_exit_a',
            product_id: '__control_exit_app__',
            control_action: 'exit_app',
            control_label: '退出',
            sort_order: -397,
            x_pct: 0.02,
            y_pct: 0.82,
            width_pct: 0.08,
            height_pct: 0.14,
            updated_at_ms: 1710000010004,
          },
          {
            hotspot_id: 'station_hotspot_a_1',
            product_id: 'product_001',
            sort_order: 1,
            x_pct: 0.1,
            y_pct: 0.15,
            width_pct: 0.2,
            height_pct: 0.2,
            updated_at_ms: 1710000010100,
          },
        ],
        timeline_events: [
          {
            event_id: 'timeline_station_a_1',
            sort_order: 0,
            time_ms: 0,
            product_id: 'product_001',
            station_hotspot_id: 'station_hotspot_a_1',
            event_type: 'focus_switch',
            updated_at_ms: 1710000010400,
          },
        ],
      },
      station_b: {
        station_id: 'station_second',
        slot_key: 'display_slot_2',
        station_key: 'station_b',
        label: '第二站点',
        recording_id: 'recording_station_b',
        stop_index: 0,
        stop_name: '第二站介绍',
        background_enabled: true,
        wireframe_enabled: true,
        background_updated_at_ms: 1710000010200,
        wireframe_updated_at_ms: 1710000010200,
        base_width: 1024,
        base_height: 768,
        hotspots: [
          {
            hotspot_id: 'station_hotspot_control_switch_b',
            product_id: '__control_toggle_station__',
            control_action: 'toggle_station',
            control_label: '站台切换',
            sort_order: -400,
            x_pct: 0.02,
            y_pct: 0.05,
            width_pct: 0.08,
            height_pct: 0.18,
            updated_at_ms: 1710000010201,
          },
          {
            hotspot_id: 'station_hotspot_control_station_b',
            product_id: '__control_toggle_station_narration__',
            control_action: 'toggle_station_narration',
            control_label: '全站讲解',
            sort_order: -399,
            x_pct: 0.02,
            y_pct: 0.27,
            width_pct: 0.08,
            height_pct: 0.2,
            updated_at_ms: 1710000010202,
          },
          {
            hotspot_id: 'station_hotspot_control_ops_b',
            product_id: '__control_enter_ops__',
            control_action: 'enter_ops',
            control_label: '运维',
            sort_order: -398,
            x_pct: 0.02,
            y_pct: 0.52,
            width_pct: 0.08,
            height_pct: 0.14,
            updated_at_ms: 1710000010203,
          },
          {
            hotspot_id: 'station_hotspot_control_exit_b',
            product_id: '__control_exit_app__',
            control_action: 'exit_app',
            control_label: '退出',
            sort_order: -397,
            x_pct: 0.02,
            y_pct: 0.82,
            width_pct: 0.08,
            height_pct: 0.14,
            updated_at_ms: 1710000010204,
          },
          {
            hotspot_id: 'station_hotspot_b_1',
            product_id: 'product_003',
            sort_order: 1,
            x_pct: 0.45,
            y_pct: 0.22,
            width_pct: 0.18,
            height_pct: 0.18,
            updated_at_ms: 1710000010300,
          },
        ],
        timeline_events: [],
      },
    },
  };
}

function createFixture(overrides = {}) {
  const base = JSON.parse(JSON.stringify(createBaseFixture()));
  if (overrides && typeof overrides === 'object') {
    if (overrides.display) base.display = { ...base.display, ...overrides.display };
    if (overrides.hall) base.hall = { ...base.hall, ...overrides.hall };
    if (Array.isArray(overrides.products)) base.products = overrides.products;
    if (overrides.recordings && typeof overrides.recordings === 'object') {
      base.recordings = { ...base.recordings, ...overrides.recordings };
    }
    if (overrides.stations && typeof overrides.stations === 'object') {
      Object.keys(overrides.stations).forEach((key) => {
        base.stations[key] = { ...(base.stations[key] || {}), ...overrides.stations[key] };
      });
    }
  }
  return base;
}

function createTwoTimelineEventsFixture() {
  return {
    stations: {
      station_a: {
        hotspots: [
          {
            hotspot_id: 'station_hotspot_a_1',
            product_id: 'product_001',
            sort_order: 1,
            x_pct: 0.1,
            y_pct: 0.15,
            width_pct: 0.2,
            height_pct: 0.2,
            updated_at_ms: 1710000010100,
          },
          {
            hotspot_id: 'station_hotspot_a_2',
            product_id: 'product_002',
            sort_order: 2,
            x_pct: 0.45,
            y_pct: 0.15,
            width_pct: 0.2,
            height_pct: 0.2,
            updated_at_ms: 1710000010110,
          },
        ],
        timeline_events: [
          {
            event_id: 'timeline_station_a_1',
            sort_order: 0,
            time_ms: 0,
            product_id: 'product_001',
            station_hotspot_id: 'station_hotspot_a_1',
            event_type: 'focus_switch',
            updated_at_ms: 1710000010400,
          },
          {
            event_id: 'timeline_station_a_2',
            sort_order: 1,
            time_ms: 650,
            product_id: 'product_002',
            station_hotspot_id: 'station_hotspot_a_2',
            event_type: 'focus_switch',
            updated_at_ms: 1710000010500,
          },
        ],
      },
    },
  };
}

function createHighlightRangeFixture() {
  return {
    stations: {
      station_a: {
        hotspots: [
          {
            hotspot_id: 'station_hotspot_a_1',
            product_id: 'product_001',
            sort_order: 1,
            x_pct: 0.1,
            y_pct: 0.15,
            width_pct: 0.2,
            height_pct: 0.2,
            updated_at_ms: 1710000010100,
          },
        ],
        timeline_events: [
          {
            event_id: 'timeline_station_a_1',
            sort_order: 0,
            time_ms: 0,
            product_id: 'product_001',
            station_hotspot_id: 'station_hotspot_a_1',
            event_type: 'focus_switch',
            updated_at_ms: 1710000010400,
          },
          {
            event_id: 'timeline_station_a_hl_on',
            sort_order: 1,
            time_ms: 200,
            product_id: 'product_001',
            station_hotspot_id: 'station_hotspot_a_1',
            event_type: 'highlight_on',
            updated_at_ms: 1710000010450,
          },
          {
            event_id: 'timeline_station_a_hl_off',
            sort_order: 2,
            time_ms: 700,
            product_id: 'product_001',
            station_hotspot_id: 'station_hotspot_a_1',
            event_type: 'highlight_off',
            updated_at_ms: 1710000010500,
          },
        ],
      },
    },
  };
}

function createNarrationNodeFixture() {
  return {
    stations: {
      station_a: {
        hotspots: [
          {
            hotspot_id: 'station_hotspot_a_1',
            product_id: 'product_001',
            sort_order: 1,
            x_pct: 0.1,
            y_pct: 0.15,
            width_pct: 0.2,
            height_pct: 0.2,
            updated_at_ms: 1710000010100,
          },
          {
            hotspot_id: 'station_hotspot_a_2',
            product_id: 'product_002',
            sort_order: 2,
            x_pct: 0.42,
            y_pct: 0.18,
            width_pct: 0.2,
            height_pct: 0.22,
            updated_at_ms: 1710000010110,
          },
        ],
        narration_nodes: [
          {
            node_id: 'narration_node_a_1',
            sort_order: 0,
            recording_id: 'recording_station_a',
            stop_index: 0,
            stop_name: '入口介绍',
            highlight_start_ms: 200,
            highlight_end_ms: 700,
            hotspot_ids: ['station_hotspot_a_1'],
            updated_at_ms: 1710000010600,
          },
        ],
      },
    },
  };
}

function deriveNarrationNodes(station) {
  const rawNodes = Array.isArray(station && station.narration_nodes) ? station.narration_nodes : [];
  if (rawNodes.length) {
    return rawNodes.map((node, index) => ({
      node_id: String((node && node.node_id) || `narration_node_${index}`),
      sort_order: Number(node && node.sort_order != null ? node.sort_order : index),
      recording_id: String((node && node.recording_id) || (station && station.recording_id) || ''),
      stop_index: Number(node && node.stop_index != null ? node.stop_index : (station && station.stop_index) || 0),
      stop_name: String((node && node.stop_name) || (station && station.stop_name) || ''),
      highlight_start_ms: Number((node && node.highlight_start_ms) || 0),
      highlight_end_ms: Number((node && node.highlight_end_ms) || 0),
      hotspot_ids: Array.isArray(node && node.hotspot_ids) ? node.hotspot_ids.map((id) => String(id || '')) : [],
      updated_at_ms: Number((node && node.updated_at_ms) || Date.now()),
    }));
  }
  const rawEvents = Array.isArray(station && station.timeline_events) ? station.timeline_events : [];
  const pending = new Map();
  const nodes = [];
  rawEvents.forEach((event) => {
    const type = String((event && event.event_type) || 'focus_switch');
    const hotspotId = String((event && event.station_hotspot_id) || '');
    const timeMs = Number((event && event.time_ms) || 0);
    if (!hotspotId) return;
    if (type === 'highlight_on') {
      pending.set(hotspotId, timeMs);
      return;
    }
    if (type === 'highlight_off' && pending.has(hotspotId)) {
      nodes.push({
        node_id: `narration_node_${hotspotId}_${timeMs}`,
        sort_order: nodes.length,
        recording_id: String((station && station.recording_id) || ''),
        stop_index: Number((station && station.stop_index) || 0),
        stop_name: String((station && station.stop_name) || ''),
        highlight_start_ms: Number(pending.get(hotspotId) || 0),
        highlight_end_ms: timeMs,
        hotspot_ids: [hotspotId],
        updated_at_ms: Number((event && event.updated_at_ms) || Date.now()),
      });
      pending.delete(hotspotId);
    }
  });
  return nodes;
}

function createRemappedDisplayFixture() {
  return {
    display: {
      slot_station_ids: ['station_second', 'station_third'],
    },
    stations: {
      station_c: {
        station_id: 'station_third',
        slot_key: 'display_slot_2',
        station_key: 'station_c',
        label: '第三站介绍',
        recording_id: 'recording_station_b',
        stop_index: 0,
        stop_name: '第三站介绍',
        background_enabled: true,
        wireframe_enabled: true,
        background_updated_at_ms: 1710000010600,
        wireframe_updated_at_ms: 1710000010600,
        base_width: 1024,
        base_height: 768,
        hotspots: [
          {
            hotspot_id: 'station_hotspot_c_1',
            product_id: 'product_002',
            sort_order: 1,
            x_pct: 0.2,
            y_pct: 0.22,
            width_pct: 0.18,
            height_pct: 0.18,
            updated_at_ms: 1710000010610,
          },
        ],
        timeline_events: [],
      },
    },
  };
}

function productImagePayload(product, offline) {
  return (product.images || []).map((image) => ({
    image_asset_id: image.image_asset_id,
    mimetype: image.mimetype || 'image/png',
    created_at_ms: Number(image.updated_at_ms || 0),
    updated_at_ms: Number(image.updated_at_ms || 0),
    image_url: offline
      ? `/api/pad/offline/images/${image.image_asset_id}`
      : `/api/pad/products/${product.product_id}/images/${image.image_asset_id}`,
    offline_image_url: `/api/pad/offline/images/${image.image_asset_id}`,
  }));
}

function stationAssetPayload(station, assetKind, offline) {
  if (!station || !station[`${assetKind}_enabled`]) return null;
  const updatedAtMs = Number(station[`${assetKind}_updated_at_ms`] || 0);
  return {
    image_url: offline
      ? `/api/pad/offline/stations/${station.station_key}/${assetKind}`
      : `/api/pad/halls/current/stations/${station.station_key}/${assetKind}`,
    offline_image_url: `/api/pad/offline/stations/${station.station_key}/${assetKind}`,
    mimetype: 'image/png',
    width: Number(station.base_width || 0),
    height: Number(station.base_height || 0),
    updated_at_ms: updatedAtMs,
  };
}

function buildFixturePayloads(state) {
  const currentHallId = String((state.hall && state.hall.hall_id) || '').trim();
  const getStationById = (stationId) =>
    Object.values(state.stations).find((station) => String(station.station_id || '') === String(stationId || '').trim()) || null;
  const productsById = new Map(
    (Array.isArray(state.products) ? state.products : []).map((product) => [String(product.product_id || ''), product])
  );
  const buildProductItem = (product, offline) => {
    const currentAudio = product.current_audio
      ? {
          audio_asset_id: product.current_audio.audio_asset_id,
          source_type: product.current_audio.source_type,
          text_snapshot: product.current_audio.text_snapshot,
          updated_at_ms: product.current_audio.updated_at_ms,
          audio_url: offline
            ? `/api/pad/offline/audio/${product.current_audio.audio_asset_id}`
            : `/api/pad/products/${product.product_id}/audio/current`,
        }
      : null;
    const images = productImagePayload(product, offline);
    return {
      product_id: product.product_id,
      hall_id: product.hall_id,
      sort_order: product.sort_order,
      product_name: product.product_name,
      product_name_en: product.product_name_en,
      intro_text: product.intro_text,
      registration_name: product.registration_name,
      registration_number: product.registration_number,
      effective_date: product.effective_date,
      company: product.company,
      product_source: product.product_source || 'imported',
      updated_at_ms: Number(product.current_audio ? product.current_audio.updated_at_ms : product.updated_at_ms || 1710000000000),
      current_audio: currentAudio,
      audio: offline ? currentAudio : undefined,
      images,
      primary_image: images[0] || null,
    };
  };
  const currentHallProducts = (Array.isArray(state.products) ? state.products : []).filter(
    (product) => String(product.hall_id || '').trim() === currentHallId
  );
  const referencedProductIds = Array.from(
    new Set(
      Object.values(state.stations)
        .flatMap((station) => (station.hotspots || []).map((hotspot) => String(hotspot.product_id || '').trim()))
        .filter((productId) => {
          const product = productsById.get(productId);
          return !!product && String(product.hall_id || '').trim() !== currentHallId;
        })
    )
  );
  const referencedProducts = referencedProductIds
    .map((productId) => productsById.get(productId))
    .filter(Boolean);
  const productItems = currentHallProducts.map((product) => buildProductItem(product, false));
  const referencedProductItems = referencedProducts.map((product) => buildProductItem(product, false));
  const stationItems = (state.display && Array.isArray(state.display.slot_station_ids) ? state.display.slot_station_ids : [])
    .map((stationId, index) => {
      const station = getStationById(stationId);
      const slotKey = index === 0 ? 'display_slot_1' : 'display_slot_2';
      if (!station) return null;
      return {
        station_id: station.station_id,
        slot_key: slotKey,
        station_key: station.station_key,
        label: station.label,
        recording_id: station.recording_id,
        stop_index: station.stop_index,
        stop_name: station.stop_name,
        background: stationAssetPayload(station, 'background', false),
        wireframe: stationAssetPayload(station, 'wireframe', false),
        hotspots: (station.hotspots || []).map((hotspot) => {
          const product = productsById.get(String(hotspot.product_id || '').trim()) || null;
          return {
            hotspot_id: hotspot.hotspot_id,
            station_id: station.station_id,
            slot_key: slotKey,
            station_key: station.station_key,
            product_id: hotspot.product_id,
            product_name: product ? product.product_name : '',
            product_name_en: product ? product.product_name_en : '',
            product_hall_id: product ? product.hall_id : '',
            product_source: product ? product.product_source || 'imported' : '',
            has_active_audio: !!(product && product.current_audio),
            audio_asset_id: product && product.current_audio ? product.current_audio.audio_asset_id : '',
            audio_url: product && product.current_audio ? `/api/pad/products/${product.product_id}/audio/current` : '',
            target_type: hotspot.control_action ? 'control' : 'product',
            control_action: hotspot.control_action || '',
            control_label: hotspot.control_label || '',
            sort_order: hotspot.sort_order,
            x_pct: hotspot.x_pct,
            y_pct: hotspot.y_pct,
            width_pct: hotspot.width_pct,
            height_pct: hotspot.height_pct,
            updated_at_ms: hotspot.updated_at_ms,
          };
        }),
        updated_at_ms: Math.max(
          Number(station.background_updated_at_ms || 0),
          Number(station.wireframe_updated_at_ms || 0),
          ...(station.hotspots || []).map((hotspot) => Number(hotspot.updated_at_ms || 0)),
          1710000000000
        ),
        narration_nodes: deriveNarrationNodes(station),
      };
    })
    .filter(Boolean);
  const manifestItems = currentHallProducts.map((product) => buildProductItem(product, true));
  const manifestReferencedItems = referencedProducts.map((product) => buildProductItem(product, true));
  const manifestStations = stationItems.map((station) => ({
    ...station,
    background: stationAssetPayload(state.stations[station.station_key], 'background', true),
    wireframe: stationAssetPayload(state.stations[station.station_key], 'wireframe', true),
  }));
  const activeAudioCount = manifestItems.filter((item) => item.audio).length;
  const updatedAtMs = Math.max(
    1710000000000,
    ...manifestItems.map((item) => Number(item.updated_at_ms || 0)),
    ...manifestReferencedItems.map((item) => Number(item.updated_at_ms || 0)),
    ...manifestStations.map((item) => Number(item.updated_at_ms || 0))
  );
  const hall = {
    hall_id: state.hall.hall_id,
    hall_name: state.hall.hall_name,
    product_count: productItems.length,
    active_audio_count: activeAudioCount,
    updated_at_ms: updatedAtMs,
  };
  return {
    bootstrap: {
      ok: true,
      client_id: '',
      display: {
        display_id: state.display.display_id,
        display_name: state.display.display_name,
        slot_station_ids: state.display.slot_station_ids,
        updated_at_ms: updatedAtMs,
      },
      hall,
      navigation: {
        home_url: '/',
        ragint_tour_url: '/ragint/?entry=tour',
      },
      offline: {
        manifest_url: '/api/pad/offline/manifest',
        version: updatedAtMs,
        product_count: productItems.length,
        active_audio_count: activeAudioCount,
      },
    },
    products: {
      ok: true,
      client_id: '',
      hall,
      items: productItems,
      referenced_items: referencedProductItems,
    },
    stations: {
      ok: true,
      client_id: '',
      display: {
        display_id: state.display.display_id,
        display_name: state.display.display_name,
        slot_station_ids: state.display.slot_station_ids,
        updated_at_ms: updatedAtMs,
      },
      hall,
      items: stationItems,
    },
    display: {
      ok: true,
      client_id: '',
      display: {
        display_id: state.display.display_id,
        display_name: state.display.display_name,
        slot_station_ids: state.display.slot_station_ids,
        updated_at_ms: updatedAtMs,
      },
      hall,
      station_catalog: [
        { hall_id: state.hall.hall_id, station_id: 'station_entrance', label: '入口介绍', sort_order: 0, updated_at_ms: updatedAtMs },
        { hall_id: state.hall.hall_id, station_id: 'station_second', label: '第二站介绍', sort_order: 1, updated_at_ms: updatedAtMs },
      ],
      stations: stationItems,
    },
    manifest: {
      ok: true,
      client_id: '',
      display: {
        display_id: state.display.display_id,
        display_name: state.display.display_name,
        slot_station_ids: state.display.slot_station_ids,
        updated_at_ms: updatedAtMs,
      },
      hall,
      version: updatedAtMs,
      items: manifestItems,
      referenced_items: manifestReferencedItems,
      stations: manifestStations,
    },
  };
}

async function fulfillJson(route, payload, status = 200) {
  await route.fulfill({
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function installPadApiMocks(page, options = {}) {
  const state = createFixture(options.fixtureOverrides || {});
  const findProductById = (productId) =>
    (Array.isArray(state.products) ? state.products : []).find(
      (item) => String(item && item.product_id ? item.product_id : '') === String(productId || '').trim()
    ) || null;
  const createPlaceholderProduct = (productName) => {
    const updatedAtMs = Date.now();
    const product = {
      product_id: `manual_product_${updatedAtMs}`,
      hall_id: state.hall.hall_id,
      sort_order: (Array.isArray(state.products) ? state.products.length : 0) + 1,
      product_name: String(productName || '').trim(),
      product_name_en: '',
      intro_text: '',
      registration_name: '',
      registration_number: '',
      effective_date: '',
      company: '',
      product_source: 'manual_placeholder',
      current_audio: null,
      images: [],
      updated_at_ms: updatedAtMs,
    };
    state.products.push(product);
    return product;
  };
  const getFixtureStation = (stationKey) => {
    const key = String(stationKey || '').trim();
    if (key === 'display_slot_1' || key === 'display_slot_2') {
      const slotIndex = key === 'display_slot_1' ? 0 : 1;
      const mappedStationId =
        state.display && Array.isArray(state.display.slot_station_ids) ? state.display.slot_station_ids[slotIndex] : '';
      const mapped =
        Object.values(state.stations).find((item) => item && String(item.station_id || '') === String(mappedStationId || '').trim()) ||
        null;
      if (mapped) return mapped;
    }
    return (
      Object.values(state.stations).find(
        (item) => item && (item.slot_key === key || item.station_key === key || item.station_id === key)
      ) || null
    );
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const method = String(request.method() || '').toUpperCase();
    const url = new URL(request.url());
    const path = url.pathname;
    const payloads = buildFixturePayloads(state);

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    if (path === '/api/pad/bootstrap' && method === 'GET') {
      await fulfillJson(route, payloads.bootstrap);
      return;
    }

    if (path === '/api/pad/halls/current/products' && method === 'GET') {
      await fulfillJson(route, payloads.products);
      return;
    }

    if (path === '/api/pad/products/search' && method === 'GET') {
      const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const items = (Array.isArray(state.products) ? state.products : [])
        .filter((product) => {
          if (!query) return false;
          return [product.product_name, product.product_name_en, product.registration_name]
            .map((value) => String(value || '').toLowerCase())
            .some((value) => value.includes(query));
        })
        .map((product) => ({
          product_id: product.product_id,
          hall_id: product.hall_id,
          product_name: product.product_name,
          product_name_en: product.product_name_en || '',
          product_source: product.product_source || 'imported',
          has_active_audio: !!product.current_audio,
        }));
      await fulfillJson(route, { ok: true, client_id: '', items });
      return;
    }

    if (path === '/api/pad/display/current' && method === 'GET') {
      await fulfillJson(route, payloads.display);
      return;
    }

    if (path === '/api/pad/halls/current/stations' && method === 'GET') {
      await fulfillJson(route, payloads.stations);
      return;
    }

    if (path === '/api/pad/display/current/config' && method === 'PUT') {
      const body = request.postDataJSON ? request.postDataJSON() : {};
      if (Array.isArray(body.slot_station_ids) && body.slot_station_ids.length === 2) {
        const nextIds = body.slot_station_ids.map((item) => String(item || '').trim());
        if (!nextIds[0] || !nextIds[1] || nextIds[0] === nextIds[1]) {
          await fulfillJson(route, { ok: false, error: 'display_station_ids_must_be_distinct' }, 400);
          return;
        }
        state.display.slot_station_ids = nextIds;
      }
      if (body.display_id) state.display.display_id = String(body.display_id).trim();
      if (body.display_name) state.display.display_name = String(body.display_name).trim();
      await fulfillJson(route, { ok: true, display: buildFixturePayloads(state).display.display });
      return;
    }

    if (path === '/api/pad/offline/manifest' && method === 'GET') {
      await fulfillJson(route, payloads.manifest);
      return;
    }

    if (/^\/api\/pad\/offline\/audio\//.test(path) && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, 'content-type': 'audio/wav' },
        path: MOCK_AUDIO_PATH,
      });
      return;
    }

    if (
      (/^\/api\/pad\/offline\/images\//.test(path) ||
        /^\/api\/pad\/offline\/stations\/[^/]+\/background$/.test(path) ||
        /^\/api\/pad\/offline\/stations\/[^/]+\/wireframe$/.test(path) ||
        /^\/api\/pad\/halls\/current\/stations\/[^/]+\/background$/.test(path) ||
        /^\/api\/pad\/halls\/current\/stations\/[^/]+\/wireframe$/.test(path) ||
        /^\/api\/pad\/products\/[^/]+\/images\/[^/]+$/.test(path)) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, 'content-type': 'image/png' },
        body: MOCK_IMAGE_BYTES,
      });
      return;
    }

    if (/^\/api\/pad\/products\/[^/]+\/audio\/current$/.test(path) && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, 'content-type': 'audio/wav' },
        path: MOCK_AUDIO_PATH,
      });
      return;
    }

    const productRegenerateMatch = path.match(/^\/api\/pad\/products\/([^/]+)\/audio\/regenerate$/);
    if (productRegenerateMatch && method === 'POST') {
      const productId = decodeURIComponent(productRegenerateMatch[1]);
      const body = request.postDataJSON ? request.postDataJSON() : {};
      const target = findProductById(productId);
      if (!target) {
        await fulfillJson(route, { ok: false, error: 'product_not_found' }, 404);
        return;
      }
      const updatedAtMs = Date.now();
      target.current_audio = {
        audio_asset_id: `audio_tts_${productId}_${updatedAtMs}`,
        source_type: 'tts',
        text_snapshot: String((body && body.text) || '').trim(),
        updated_at_ms: updatedAtMs,
      };
      await fulfillJson(route, {
        ok: true,
        product: { product_id: productId },
        audio: {
          product_id: productId,
          audio_asset_id: target.current_audio.audio_asset_id,
          source_type: 'tts',
          text_snapshot: target.current_audio.text_snapshot,
          mimetype: 'audio/wav',
          is_active: true,
          created_at_ms: updatedAtMs,
          updated_at_ms: updatedAtMs,
          audio_url: `/api/pad/products/${productId}/audio/current`,
          offline_audio_url: `/api/pad/offline/audio/${target.current_audio.audio_asset_id}`,
        },
      });
      return;
    }

    const productImageUploadMatch = path.match(/^\/api\/pad\/products\/([^/]+)\/images\/upload$/);
    if (productImageUploadMatch && method === 'POST') {
      const productId = decodeURIComponent(productImageUploadMatch[1]);
      const target = findProductById(productId);
      if (!target) {
        await fulfillJson(route, { ok: false, error: 'product_not_found' }, 404);
        return;
      }
      const updatedAtMs = Date.now();
      target.images = [
        { image_asset_id: `image_${productId}_${updatedAtMs}`, mimetype: 'image/png', updated_at_ms: updatedAtMs },
      ].concat(target.images || []);
      await fulfillJson(route, {
        ok: true,
        product: { product_id: productId },
        image: {
          product_id: productId,
          image_asset_id: target.images[0].image_asset_id,
          mimetype: 'image/png',
          created_at_ms: updatedAtMs,
          updated_at_ms: updatedAtMs,
          image_url: `/api/pad/products/${productId}/images/${target.images[0].image_asset_id}`,
          offline_image_url: `/api/pad/offline/images/${target.images[0].image_asset_id}`,
        },
      });
      return;
    }

    const productUpdateMatch = path.match(/^\/api\/pad\/products\/([^/]+)$/);
    if (productUpdateMatch && method === 'PUT') {
      const productId = decodeURIComponent(productUpdateMatch[1]);
      const body = request.postDataJSON ? request.postDataJSON() : {};
      const target = findProductById(productId);
      if (!target) {
        await fulfillJson(route, { ok: false, error: 'product_not_found' }, 404);
        return;
      }
      target.product_name = String((body && body.product_name) || target.product_name || '').trim();
      target.intro_text = String((body && body.intro_text) || '').trim();
      target.updated_at_ms = Date.now();
      await fulfillJson(route, { ok: true, product: buildFixturePayloads(state).products.items.find((item) => item.product_id === productId) || target });
      return;
    }

    const stationUpdateMatch = path.match(/^\/api\/pad\/halls\/current\/stations\/([^/]+)$/);
    if (stationUpdateMatch && method === 'PUT') {
      const stationKey = decodeURIComponent(stationUpdateMatch[1]);
      const body = request.postDataJSON ? request.postDataJSON() : {};
      const target = getFixtureStation(stationKey);
      if (!target) {
        await fulfillJson(route, { ok: false, error: 'station_id_invalid' }, 400);
        return;
      }
      target.label = String((body && body.label) || '').trim();
      target.recording_id = String((body && body.recording_id) || '').trim();
      target.stop_index = body && Object.prototype.hasOwnProperty.call(body, 'stop_index') ? body.stop_index : null;
      target.stop_name = String((body && body.stop_name) || '').trim();
      await fulfillJson(route, {
        ok: true,
        station: buildFixturePayloads(state).stations.items.find((item) => item.slot_key === stationKey || item.station_key === stationKey || item.station_id === stationKey),
      });
      return;
    }

    const stationBackgroundMatch = path.match(/^\/api\/pad\/halls\/current\/stations\/([^/]+)\/background$/);
    if (stationBackgroundMatch && method === 'POST') {
      const stationKey = decodeURIComponent(stationBackgroundMatch[1]);
      const target = getFixtureStation(stationKey);
      if (!target) {
        await fulfillJson(route, { ok: false, error: 'station_id_invalid' }, 400);
        return;
      }
      target.background_enabled = true;
      target.background_updated_at_ms = Date.now();
      target.base_width = 1024;
      target.base_height = 768;
      await fulfillJson(route, {
        ok: true,
        station: buildFixturePayloads(state).stations.items.find((item) => item.slot_key === stationKey || item.station_key === stationKey || item.station_id === stationKey),
      });
      return;
    }

    const stationWireframeMatch = path.match(/^\/api\/pad\/halls\/current\/stations\/([^/]+)\/wireframe$/);
    if (stationWireframeMatch && method === 'POST') {
      const stationKey = decodeURIComponent(stationWireframeMatch[1]);
      const target = getFixtureStation(stationKey);
      if (!target) {
        await fulfillJson(route, { ok: false, error: 'station_id_invalid' }, 400);
        return;
      }
      target.wireframe_enabled = true;
      target.wireframe_updated_at_ms = Date.now();
      await fulfillJson(route, {
        ok: true,
        station: buildFixturePayloads(state).stations.items.find((item) => item.slot_key === stationKey || item.station_key === stationKey || item.station_id === stationKey),
      });
      return;
    }

    const stationHotspotsMatch = path.match(/^\/api\/pad\/halls\/current\/stations\/([^/]+)\/hotspots$/);
    if (stationHotspotsMatch && method === 'POST') {
      const stationKey = decodeURIComponent(stationHotspotsMatch[1]);
      const body = request.postDataJSON ? request.postDataJSON() : {};
      const target = getFixtureStation(stationKey);
      if (!target) {
        await fulfillJson(route, { ok: false, error: 'station_id_invalid' }, 400);
        return;
      }
      const updatedAtMs = Date.now();
      const requestedProductId = String((body && body.product_id) || '').trim();
      const manualProductName = String((body && body.manual_product_name) || '').trim();
      const resolvedProduct = requestedProductId
        ? findProductById(requestedProductId)
        : manualProductName
          ? createPlaceholderProduct(manualProductName)
          : null;
      const hotspot = {
        hotspot_id: `station_hotspot_${stationKey}_${updatedAtMs}`,
        product_id: resolvedProduct ? String(resolvedProduct.product_id || '').trim() : requestedProductId,
        sort_order: Number((body && body.sort_order) || 0),
        x_pct: Number((body && body.x_pct) || 0),
        y_pct: Number((body && body.y_pct) || 0),
        width_pct: Number((body && body.width_pct) || 0),
        height_pct: Number((body && body.height_pct) || 0),
        updated_at_ms: updatedAtMs,
      };
      target.hotspots = [hotspot].concat(target.hotspots || []);
      const builtStation = buildFixturePayloads(state).stations.items.find(
        (item) => item.slot_key === stationKey || item.station_key === stationKey || item.station_id === stationKey
      );
      const builtHotspot = builtStation && (builtStation.hotspots || []).find((item) => item.hotspot_id === hotspot.hotspot_id);
      await fulfillJson(route, {
        ok: true,
        hotspot: builtHotspot,
      });
      return;
    }

    const stationTimelineMatch = path.match(/^\/api\/pad\/halls\/current\/stations\/([^/]+)\/timeline$/);
    if (stationTimelineMatch && method === 'PUT') {
      const stationKey = decodeURIComponent(stationTimelineMatch[1]);
      const target = getFixtureStation(stationKey);
      const body = request.postDataJSON ? request.postDataJSON() : {};
      const rawNodes = Array.isArray(body.narration_nodes) ? body.narration_nodes : [];
      if (target) {
        target.narration_nodes = rawNodes.map((node, index) => ({
          node_id: String((node && node.node_id) || `narration_node_${stationKey}_${index}_${Date.now()}`),
          sort_order: Number(node && node.sort_order != null ? node.sort_order : index),
          recording_id: String((node && node.recording_id) || '').trim(),
          stop_index: Number(node && node.stop_index != null ? node.stop_index : 0),
          stop_name: String((node && node.stop_name) || '').trim(),
          highlight_start_ms: Number(node && node.highlight_start_ms ? node.highlight_start_ms : 0),
          highlight_end_ms: Number(node && node.highlight_end_ms ? node.highlight_end_ms : 0),
          hotspot_ids: Array.isArray(node && node.hotspot_ids)
            ? node.hotspot_ids.map((hotspotId) => String(hotspotId || '').trim()).filter(Boolean)
            : [],
          updated_at_ms: Date.now(),
        }));
      }
      await fulfillJson(route, { ok: true, narration_nodes: target ? target.narration_nodes : rawNodes });
      return;
    }

    const stationHotspotMatch = path.match(/^\/api\/pad\/halls\/current\/stations\/([^/]+)\/hotspots\/([^/]+)$/);
    if (stationHotspotMatch && method === 'PUT') {
      const stationKey = decodeURIComponent(stationHotspotMatch[1]);
      const hotspotId = decodeURIComponent(stationHotspotMatch[2]);
      const body = request.postDataJSON ? request.postDataJSON() : {};
      const target = getFixtureStation(stationKey);
      const hotspot = target && (target.hotspots || []).find((item) => item.hotspot_id === hotspotId);
      if (!target || !hotspot) {
        await fulfillJson(route, { ok: false, error: 'hotspot_not_found' }, 404);
        return;
      }
      const requestedProductId = String((body && body.product_id) || '').trim();
      const manualProductName = String((body && body.manual_product_name) || '').trim();
      const resolvedProduct = requestedProductId
        ? findProductById(requestedProductId)
        : manualProductName
          ? createPlaceholderProduct(manualProductName)
          : null;
      hotspot.product_id = resolvedProduct ? String(resolvedProduct.product_id || '').trim() : requestedProductId;
      hotspot.sort_order = Number((body && body.sort_order) || 0);
      hotspot.x_pct = Number((body && body.x_pct) || 0);
      hotspot.y_pct = Number((body && body.y_pct) || 0);
      hotspot.width_pct = Number((body && body.width_pct) || 0);
      hotspot.height_pct = Number((body && body.height_pct) || 0);
      hotspot.updated_at_ms = Date.now();
      const builtStation = buildFixturePayloads(state).stations.items.find(
        (item) => item.slot_key === stationKey || item.station_key === stationKey || item.station_id === stationKey
      );
      const builtHotspot = builtStation && (builtStation.hotspots || []).find((item) => item.hotspot_id === hotspot.hotspot_id);
      await fulfillJson(route, {
        ok: true,
        hotspot: builtHotspot,
      });
      return;
    }

    if (stationHotspotMatch && method === 'DELETE') {
      const stationKey = decodeURIComponent(stationHotspotMatch[1]);
      const hotspotId = decodeURIComponent(stationHotspotMatch[2]);
      const target = getFixtureStation(stationKey);
      if (!target) {
        await fulfillJson(route, { ok: false, error: 'hotspot_not_found' }, 404);
        return;
      }
      target.hotspots = (target.hotspots || []).filter((item) => item.hotspot_id !== hotspotId);
      await fulfillJson(route, { ok: true, deleted: true, hotspot_id: hotspotId });
      return;
    }

    if (path === '/api/recordings' && method === 'GET') {
      await fulfillJson(route, {
        items: Object.values(state.recordings).map((recording) => ({
          recording_id: recording.recording_id,
          display_name: recording.display_name,
          created_at_ms: recording.created_at_ms,
          finished_at_ms: recording.finished_at_ms,
          stop_count: recording.stops.length,
          metadata: recording.metadata,
        })),
      });
      return;
    }

    const recordingMetaMatch = path.match(/^\/api\/recordings\/([^/]+)$/);
    if (recordingMetaMatch && method === 'GET') {
      const recordingId = decodeURIComponent(recordingMetaMatch[1]);
      const recording = state.recordings[recordingId];
      if (!recording) {
        await fulfillJson(route, { error: 'not_found' }, 404);
        return;
      }
      await fulfillJson(route, recording);
      return;
    }

    const recordingStopMatch = path.match(/^\/api\/recordings\/([^/]+)\/stop\/([^/]+)$/);
    if (recordingStopMatch && method === 'GET') {
      const recordingId = decodeURIComponent(recordingStopMatch[1]);
      const stopIndex = Number(decodeURIComponent(recordingStopMatch[2]));
      const recording = state.recordings[recordingId];
      if (!recording || stopIndex < 0 || stopIndex >= recording.stops.length) {
        await fulfillJson(route, { error: 'not_found' }, 404);
        return;
      }
      await fulfillJson(route, {
        stop_name: recording.stops[stopIndex],
        answer_text: `${recording.display_name}-${recording.stops[stopIndex]}`,
        segments: [
          {
            segment_id: 1,
            text: `${recording.display_name}-${recording.stops[stopIndex]}`,
            audio_url: `/api/pad/offline/audio/${recording.recording_id}_stop_${stopIndex}`,
            duration_ms: 1000,
            updated_at_ms: Date.now(),
          },
        ],
      });
      return;
    }

    if (path === '/api/app_settings' && method === 'GET') {
      await fulfillJson(route, { settings: {} });
      return;
    }

    if (path === '/api/app_settings' && method === 'PUT') {
      await fulfillJson(route, { ok: true });
      return;
    }

    if (path === '/api/breakpoint' && method === 'GET') {
      await fulfillJson(route, { ok: true, state: {} });
      return;
    }

    if (path === '/api/breakpoint' && method === 'POST') {
      await fulfillJson(route, { ok: true });
      return;
    }

    if (path === '/api/ragflow/chats' && method === 'GET') {
      await fulfillJson(route, { chats: [{ name: 'Exhibit Chat' }], default: 'Exhibit Chat' });
      return;
    }

    if (path === '/api/ragflow/agents' && method === 'GET') {
      await fulfillJson(route, { agents: [], default: '' });
      return;
    }

    if (path === '/api/history' && method === 'GET') {
      await fulfillJson(route, { items: [] });
      return;
    }

    await fulfillJson(route, {});
  });

  return { state, getFixtureStation };
}

async function installClientIdAndAudioStub(page, clientId) {
  await page.addInitScript((value) => {
    const mediaProto = window.HTMLMediaElement.prototype;
    if (!mediaProto.__ragint_meta_stubbed) {
      Object.defineProperty(mediaProto, 'src', {
        configurable: true,
        get() {
          return this.__ragint_src || '';
        },
        set(nextValue) {
          this.__ragint_src = String(nextValue || '');
          this.__ragint_ready_state = 1;
          try {
            this.dispatchEvent(new Event('loadedmetadata'));
          } catch (_) {}
        },
      });
      Object.defineProperty(mediaProto, 'currentSrc', {
        configurable: true,
        get() {
          return this.__ragint_src || '';
        },
      });
      Object.defineProperty(mediaProto, 'readyState', {
        configurable: true,
        get() {
          return Number(this.__ragint_ready_state || 0);
        },
      });
      Object.defineProperty(mediaProto, 'duration', {
        configurable: true,
        get() {
          return Number(this.__ragint_test_duration || 1);
        },
      });
      Object.defineProperty(mediaProto, 'currentTime', {
        configurable: true,
        get() {
          return Number(this.__ragint_current_time || 0);
        },
        set(nextValue) {
          this.__ragint_current_time = Number(nextValue || 0);
        },
      });
      mediaProto.__ragint_meta_stubbed = true;
    }
    window.localStorage.setItem('clientId', value);
    window.localStorage.removeItem('ragint-pad-demo-play-counts-v1');
    window.localStorage.removeItem('ragint-pad-demo-columns-v1');
    window.__ragint_test_confirm_response = true;
    window.__ragint_test_close_called = false;
    window.confirm = function confirmStub() {
      return !!window.__ragint_test_confirm_response;
    };
    window.close = function closeStub() {
      window.__ragint_test_close_called = true;
    };
    window.HTMLMediaElement.prototype.play = function playStub() {
      try {
        this.dispatchEvent(new Event('play'));
      } catch (_) {}
      return Promise.resolve();
    };
    window.HTMLMediaElement.prototype.pause = function pauseStub() {
      try {
        this.dispatchEvent(new Event('pause'));
      } catch (_) {}
    };
    window.HTMLMediaElement.prototype.load = function loadStub() {
      return undefined;
    };
  }, clientId);
}

async function installClientIdOnly(page, clientId) {
  await page.addInitScript((value) => {
    const mediaProto = window.HTMLMediaElement.prototype;
    if (!mediaProto.__ragint_meta_stubbed) {
      Object.defineProperty(mediaProto, 'src', {
        configurable: true,
        get() {
          return this.__ragint_src || '';
        },
        set(nextValue) {
          this.__ragint_src = String(nextValue || '');
          this.__ragint_ready_state = 1;
          try {
            this.dispatchEvent(new Event('loadedmetadata'));
          } catch (_) {}
        },
      });
      Object.defineProperty(mediaProto, 'currentSrc', {
        configurable: true,
        get() {
          return this.__ragint_src || '';
        },
      });
      Object.defineProperty(mediaProto, 'readyState', {
        configurable: true,
        get() {
          return Number(this.__ragint_ready_state || 0);
        },
      });
      Object.defineProperty(mediaProto, 'duration', {
        configurable: true,
        get() {
          return Number(this.__ragint_test_duration || 1);
        },
      });
      Object.defineProperty(mediaProto, 'currentTime', {
        configurable: true,
        get() {
          return Number(this.__ragint_current_time || 0);
        },
        set(nextValue) {
          this.__ragint_current_time = Number(nextValue || 0);
        },
      });
      mediaProto.__ragint_meta_stubbed = true;
    }
    window.localStorage.setItem('clientId', value);
    window.localStorage.removeItem('ragint-pad-demo-play-counts-v1');
    window.localStorage.removeItem('ragint-pad-demo-columns-v1');
    window.__ragint_test_confirm_response = true;
    window.__ragint_test_close_called = false;
    window.confirm = function confirmStub() {
      return !!window.__ragint_test_confirm_response;
    };
    window.close = function closeStub() {
      window.__ragint_test_close_called = true;
    };
    window.HTMLMediaElement.prototype.play = async function playWithValidation() {
      const src = String(this.currentSrc || this.src || '');
      if (!src) throw new Error('audio_src_missing');
      const response = await fetch(src);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const hasWavHeader =
        bytes.length > 44 &&
        String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
        String.fromCharCode(...bytes.slice(8, 12)) === 'WAVE';
      let nonZeroCount = 0;
      for (let index = 44; index < bytes.length; index += 2) {
        if (bytes[index] !== 0 || bytes[index + 1] !== 0) {
          nonZeroCount += 1;
          if (nonZeroCount > 32) break;
        }
      }
      if (!hasWavHeader || nonZeroCount <= 32) {
        throw new Error('audio_payload_invalid');
      }
      this.__ragint_test_playing = true;
      this.__ragint_test_duration = Math.max(1, Math.floor((bytes.length - 44) / 32000));
      this.__ragint_test_current_src = src;
      this.dispatchEvent(new Event('play'));
      window.setTimeout(() => {
        this.__ragint_test_playing = false;
        this.dispatchEvent(new Event('ended'));
      }, 1000);
      return Promise.resolve();
    };
    window.HTMLMediaElement.prototype.pause = function pauseWithValidation() {
      this.__ragint_test_playing = false;
      this.dispatchEvent(new Event('pause'));
    };
    window.HTMLMediaElement.prototype.load = function loadWithValidation() {
      return undefined;
    };
  }, clientId);
}

async function captureEvidence(page, testInfo, name) {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(name, { path: screenshotPath, contentType: 'image/png' });
}

async function waitForOfflineReady(page) {
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().offlineReady || false), { timeout: 7000 })
    .toBe(true);
}

async function switchToOpsMode(page) {
  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.setMode?.('ops'));
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().mode || ''), { timeout: 3000 })
    .toBe('ops');
}

async function switchOpsStationTab(page, tab) {
  await page.locator(`[data-action="set-ops-station-tab"][data-tab="${tab}"]`).last().click({ force: true });
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().opsStationTab || ''), { timeout: 3000 })
    .toBe(tab);
}

async function dragTimelineRange(page, slotKey, startRatio, endRatio) {
  await page.evaluate(
    ({ key, start, end }) => {
      const track = document.querySelector(`[data-role="station-timeline-track"][data-slot-key="${key}"]`);
      if (!track) throw new Error('timeline_track_missing');
      const rect = track.getBoundingClientRect();
      const y = rect.top + rect.height / 2;
      const startX = rect.left + rect.width * start;
      const endX = rect.left + rect.width * end;
      track.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: y, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: endX, clientY: y, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: endX, clientY: y, bubbles: true }));
    },
    { key: slotKey, start: startRatio, end: endRatio }
  );
}

async function dragHighlightHandle(page, slotKey, edge, targetRatio) {
  await page.evaluate(
    ({ key, handleEdge, ratio }) => {
      const handle = document.querySelector(
        `[data-action="station-timeline-drag-highlight-${handleEdge}"][data-slot-key="${key}"]`
      );
      const track = document.querySelector(`[data-role="station-timeline-track"][data-slot-key="${key}"]`);
      if (!handle || !track) throw new Error('timeline_highlight_handle_missing');
      const handleRect = handle.getBoundingClientRect();
      const trackRect = track.getBoundingClientRect();
      const startX = handleRect.left + handleRect.width / 2;
      const y = trackRect.top + trackRect.height / 2;
      const endX = trackRect.left + trackRect.width * ratio;
      handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: y, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: endX, clientY: y, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: endX, clientY: y, bubbles: true }));
    },
    { key: slotKey, handleEdge: edge, ratio: targetRatio }
  );
}

async function dragNarrationNodeRange(page, slotKey, nodeId, startRatio, endRatio) {
  await page.evaluate(
    ({ key, nid, start, end }) => {
      const track = document.querySelector(`[data-role="narration-node-track"][data-slot-key="${key}"][data-node-id="${nid}"]`);
      if (!track) throw new Error('narration_node_track_missing');
      const rect = track.getBoundingClientRect();
      const y = rect.top + rect.height / 2;
      const startX = rect.left + rect.width * start;
      const endX = rect.left + rect.width * end;
      track.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: y, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: endX, clientY: y, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: endX, clientY: y, bubbles: true }));
    },
    { key: slotKey, nid: nodeId, start: startRatio, end: endRatio }
  );
}

async function pickHotspotProduct(page, queryText, productId) {
  await page.locator('[data-action="station-hotspot-product-search"]').fill(queryText);
  await expect(page.locator(`[data-action="station-hotspot-pick"][data-product-id="${productId}"]`)).toBeVisible();
  await page.locator(`[data-action="station-hotspot-pick"][data-product-id="${productId}"]`).click();
}

async function drawEditorHotspot(page, startXRatio, startYRatio, endXRatio, endYRatio) {
  await page.evaluate(
    ({ sx, sy, ex, ey }) => {
      const el = document.querySelector('[data-scene-stage-role="editor"]');
      if (!el) throw new Error('editor_stage_missing');
      const rect = el.getBoundingClientRect();
      const startX = rect.left + rect.width * sx;
      const startY = rect.top + rect.height * sy;
      const endX = rect.left + rect.width * ex;
      const endY = rect.top + rect.height * ey;
      el.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: startY, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: endX, clientY: endY, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: endX, clientY: endY, bubbles: true }));
    },
    { sx: startXRatio, sy: startYRatio, ex: endXRatio, ey: endYRatio }
  );
}

test('demo defaults to station-integrated scene view without product list', async ({ page }, testInfo) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);

  await expect(page.locator('.pad-scene-stage')).toBeVisible();
  await expect(page.locator('[data-control-action="toggle_station"]')).toHaveCount(1);
  await expect(page.locator('[data-control-action="toggle_station_narration"]')).toHaveCount(1);
  await expect(page.locator('[data-control-action="enter_ops"]')).toHaveCount(1);
  await expect(page.locator('[data-control-action="exit_app"]')).toHaveCount(1);
  await expect(page.locator('[data-action="set-demo-left-tab"]')).toHaveCount(0);
  await expect(page.locator('[data-action="set-demo-right-tab"]')).toHaveCount(0);
  await captureEvidence(page, testInfo, 'demo-station-default');
});

test('demo switches stations and plays product narration from hotspots', async ({ page }, testInfo) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);

  await page.locator('[data-action="play-product-hotspot"][data-product-id="product_001"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().lastPlaybackRequestedUrl || ''), { timeout: 3000 })
    .toContain('/api/pad/offline/audio/audio_001');
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().playingProductId || ''), { timeout: 3000 })
    .toBe('product_001');

  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.setDemoLeftTab?.('display_slot_2'));
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().demoLeftTabKey || ''), { timeout: 3000 })
    .toBe('display_slot_2');
  await captureEvidence(page, testInfo, 'demo-station-switch');
});

test('station narration uses a real non-silent audio response and starts media playback', async ({ page }, testInfo) => {
  await installClientIdOnly(page, 'pad-a');
  await installPadApiMocks(page);

  const stationAudioResponses = [];
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/api/pad/offline/audio/recording_station_a_stop_0')) {
      stationAudioResponses.push({
        url,
        status: response.status(),
        contentType: response.headers()['content-type'] || '',
      });
    }
  });

  await page.goto('/');
  await waitForOfflineReady(page);

  await page.locator('[data-control-action="toggle_station_narration"]').click();

  await expect
    .poll(() => stationAudioResponses.length, { timeout: 5000 })
    .toBeGreaterThan(0);

  const mediaState = await page.evaluate(() => {
    const audio = document.getElementById('product-audio');
    if (!audio) return null;
    return {
      currentSrc: String(audio.__ragint_test_current_src || audio.currentSrc || ''),
      paused: !!audio.paused,
      mockedPlaying: audio.__ragint_test_playing === true,
      mockedDuration: Number(audio.__ragint_test_duration || 0),
    };
  });
  const playbackState = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());

  const audioAnalysis = analyzeMockAudio(MOCK_AUDIO_BYTES);

  expect(audioAnalysis.byteLength).toBeGreaterThan(44);
  expect(audioAnalysis.nonZeroCount).toBeGreaterThan(32);
  expect(mediaState).toBeTruthy();
  await captureEvidence(page, testInfo, 'station-real-audio-playback');
});

test('display bootstrap shape exposes display and exactly two stations', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);

  const state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.displayId).toBe('display_pad_a');
  expect(state.displayName).toBe('Display A');
  expect(state.stationCount).toBe(2);
  expect(state.stationIds).toEqual(['station_entrance', 'station_second']);
  expect(state.activeStationId).toBe('station_entrance');
  expect(state.activeStationSlotKey).toBe('display_slot_1');
});

test('hotspot click toggles the same product narration off', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);

  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.playProduct?.('product_001'));
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().playingProductId || ''), { timeout: 3000 })
    .toBe('product_001');

  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.playProduct?.('product_001'));
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().lastPlaybackRequestedUrl || ''), { timeout: 3000 })
    .toBe('');
});

test('station narration button toggles playback on and off', async ({ page }) => {
  await installClientIdOnly(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);

  await page.locator('[data-control-action="toggle_station_narration"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().audioCurrentSrc || ''), { timeout: 3000 })
    .toContain('/api/pad/offline/audio/recording_station_a_stop_0');

  await page.locator('[data-control-action="toggle_station_narration"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().lastPlaybackRequestedUrl || ''), { timeout: 3000 })
    .toBe('');
});

test('single-screen guide page has no main scroll overflow', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);

  const geometry = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
  }));
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.innerHeight + 4);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth + 4);
});

test('background fully stretched with hotspot alignment stays inside stage', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);

  const readGeometry = async () =>
    page.evaluate(() => {
      const stage = document.querySelector('.pad-scene-stage');
      const hotspot = document.querySelector('[data-action="play-product-hotspot"]');
      if (!stage || !hotspot) return null;
      const stageRect = stage.getBoundingClientRect();
      const hotspotRect = hotspot.getBoundingClientRect();
      return {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        hotspotInside:
          hotspotRect.left >= stageRect.left &&
          hotspotRect.top >= stageRect.top &&
          hotspotRect.right <= stageRect.right &&
          hotspotRect.bottom <= stageRect.bottom,
      };
    });

  let geometry = await readGeometry();
  expect(geometry.stageWidth).toBeGreaterThan(0);
  expect(geometry.stageHeight).toBeGreaterThan(0);
  expect(geometry.hotspotInside).toBe(true);

  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.setDemoLeftTab?.('display_slot_1'));
  geometry = await readGeometry();
  expect(geometry.stageWidth).toBeGreaterThan(0);
  expect(geometry.stageHeight).toBeGreaterThan(0);
  expect(geometry.hotspotInside).toBe(true);
});

test('timeline events are exposed on bound station state', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page, { fixtureOverrides: createTwoTimelineEventsFixture() });

  await page.goto('/');
  await waitForOfflineReady(page);

  const state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.stationSlots[0].timelineEvents).toHaveLength(2);
  expect(state.stationSlots[0].timelineEvents[0].hotspotId).toBe('station_hotspot_a_1');
  expect(state.stationSlots[0].timelineEvents[1].hotspotId).toBe('station_hotspot_a_2');
  expect(state.stationSlots[0].timelineEvents[1].productId).toBe('product_002');
});

test('display config remap updates bound station and guide state', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page, { fixtureOverrides: createRemappedDisplayFixture() });

  await page.goto('/');
  await waitForOfflineReady(page);

  let state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.activeStationId).toBe('station_second');

  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'settings');
  await page.locator('[data-action="station-slot-id"][data-slot-key="display_slot_1"]').selectOption('station_entrance');
  await page.locator('[data-action="save-station-config"]').first().click();
  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.setMode?.('demo'));

  state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.stationSlots[0].stationId).toBe('station_entrance');
});

test('timeline config save and reread survives reload and is visible in guide state', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page, { fixtureOverrides: createTwoTimelineEventsFixture() });

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'settings');

  await expect(page.locator('[data-action="station-timeline-time-ms"]')).toHaveCount(2);
  const secondTimelineTimeInput = page.locator('[data-action="station-timeline-time-ms"][data-index="1"]');
  await secondTimelineTimeInput.fill('400');
  await secondTimelineTimeInput.blur();
  const timelineSaveRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return request.method() === 'PUT' && url.pathname === '/api/pad/halls/current/stations/display_slot_1/timeline';
  });
  await page.locator('[data-action="save-station-config"]').first().click();
  await timelineSaveRequest;
  await page.reload();
  await waitForOfflineReady(page);

  const state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.stationSlots[0].timelineEvents).toHaveLength(2);
  expect(state.stationSlots[0].timelineEvents[1].timeMs).toBe(400);
});

test('timeline editor add remove flow works without raw json input', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page, { fixtureOverrides: createTwoTimelineEventsFixture() });

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'settings');

  await expect(page.locator('[data-action="station-timeline-events"]')).toHaveCount(0);
  await expect(page.locator('[data-action="station-timeline-time-ms"]')).toHaveCount(2);

  await page.evaluate(() => {
    const button = document.querySelector('[data-action="station-timeline-remove"][data-index="1"]');
    if (!button) throw new Error('timeline_remove_button_missing');
    button.click();
  });
  await expect(page.locator('[data-action="station-timeline-time-ms"]')).toHaveCount(1);

  await page.evaluate(() => {
    const button = document.querySelector('[data-action="station-timeline-add"]');
    if (!button) throw new Error('timeline_add_button_missing');
    button.click();
  });
  await expect(page.locator('[data-action="station-timeline-time-ms"]')).toHaveCount(2);

  const secondTimelineTimeInput = page.locator('[data-action="station-timeline-time-ms"][data-index="1"]');
  await secondTimelineTimeInput.fill('1200');
  await secondTimelineTimeInput.blur();
  const timelineSaveRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return request.method() === 'PUT' && url.pathname === '/api/pad/halls/current/stations/display_slot_1/timeline';
  });
  await page.locator('[data-action="save-station-config"]').click();
  await timelineSaveRequest;

  const state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.stationSlots[0].timelineEvents).toHaveLength(2);
  expect(state.stationSlots[0].timelineEvents[1].timeMs).toBe(1200);
});

test('station config save updates display binding and station config together', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page, { fixtureOverrides: createRemappedDisplayFixture() });

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'settings');

  await page.locator('[data-action="station-slot-id"][data-slot-key="display_slot_1"]').selectOption('station_entrance');
  await page.locator('[data-action="station-slot-label"]').fill('入口站重新映射');
  await page.locator('[data-action="save-station-config"]').click();
  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.setMode?.('demo'));

  const state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.stationSlots[0].stationId).toBe('station_entrance');
  expect(state.stationSlots[0].label).toBe('入口站重新映射');
});

test('exit asks for confirmation before closing', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);

  await page.evaluate(() => {
    window.__ragint_test_confirm_response = false;
  });
  await page.locator('[data-control-action="exit_app"]').click();
  let state = await page.evaluate(() => ({
    exitRequested: !!window.__ragint_exit_requested,
    closeCalled: !!window.__ragint_test_close_called,
  }));
  expect(state.exitRequested).toBe(false);
  expect(state.closeCalled).toBe(false);

  await page.evaluate(() => {
    window.__ragint_test_confirm_response = true;
  });
  await page.locator('[data-control-action="exit_app"]').click();
  state = await page.evaluate(() => ({
    exitRequested: !!window.__ragint_exit_requested,
    closeCalled: !!window.__ragint_test_close_called,
  }));
  expect(state.exitRequested).toBe(true);
  expect(state.closeCalled).toBe(true);
});

test('pressing H on main screen enters ops mode', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);

  await page.keyboard.press('h');
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().mode || ''), { timeout: 3000 })
    .toBe('ops');
});

test('hotspot bound to a no-audio product fails fast with explicit error', async ({ page }, testInfo) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);

  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.setDemoLeftTab?.('display_slot_2'));
  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.playProduct?.('product_003'));
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().audioError || ''), { timeout: 3000 })
    .toBe('该产品暂无生效讲解音频。');
  await captureEvidence(page, testInfo, 'demo-no-audio-hotspot');
});

test('dragging control hotspot keeps label and auto-saves geometry', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'annotate');

  const exitHotspotSelector = '[data-action="scene-editor-hotspot"][data-hotspot-id="station_hotspot_control_exit_a"]';
  const exitHotspot = page.locator(exitHotspotSelector);
  await expect(exitHotspot).toBeVisible();
  const beforeStyle = await exitHotspot.getAttribute('style');
  const updateRequestPromise = page.waitForRequest((request) => {
    try {
      const url = new URL(request.url());
      return (
        request.method() === 'PUT' &&
        url.pathname === '/api/pad/halls/current/stations/display_slot_1/hotspots/station_hotspot_control_exit_a'
      );
    } catch (_) {
      return false;
    }
  });

  await page.evaluate((selector) => {
    const node = document.querySelector(selector);
    if (!node) throw new Error('exit_hotspot_missing');
    const rect = node.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const moveX = rect.left + rect.width * 2.5;
    const moveY = rect.top - rect.height * 1.2;
    window.__RAGINT_PAD_DRAG__ = { moveX, moveY };
    node.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: startY, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: moveX, clientY: moveY, bubbles: true }));
  }, exitHotspotSelector);

  await expect(exitHotspot.locator('.pad-scene-hotspot__label')).toHaveText('退出');

  await page.evaluate(() => {
    const drag = window.__RAGINT_PAD_DRAG__;
    if (!drag) throw new Error('drag_target_missing');
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: drag.moveX, clientY: drag.moveY, bubbles: true }));
    delete window.__RAGINT_PAD_DRAG__;
  });

  const updateRequest = await updateRequestPromise;
  const requestBody = updateRequest.postDataJSON();
  expect(requestBody.product_id).toBe('__control_exit_app__');
  expect(Number(requestBody.x_pct)).not.toBeCloseTo(0.02, 4);
  expect(Number(requestBody.y_pct)).not.toBeCloseTo(0.82, 4);

  const expectedLeft = `left:${Number(requestBody.x_pct) * 100}%`;
  const expectedTop = `top:${Number(requestBody.y_pct) * 100}%`;
  await expect.poll(() => exitHotspot.getAttribute('style'), { timeout: 5000 }).toContain(expectedLeft);
  await expect.poll(() => exitHotspot.getAttribute('style'), { timeout: 5000 }).toContain(expectedTop);
  expect(await exitHotspot.getAttribute('style')).not.toBe(beforeStyle);

  await page.evaluate(() => {
    const node = document.querySelector('[data-action="scene-editor-hotspot"][data-hotspot-id="station_hotspot_a_1"]');
    if (!node) throw new Error('product_hotspot_missing');
    node.click();
  });
  await expect(exitHotspot.locator('.pad-scene-hotspot__label')).toHaveText('退出');
  await expect.poll(() => exitHotspot.getAttribute('style'), { timeout: 5000 }).toContain(expectedLeft);
});

test('ops can update station config, upload background, and create a product hotspot', async ({ page }, testInfo) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'settings');

  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.setDemoLeftTab?.('display_slot_2'));
  await page.locator('[data-action="station-slot-label"]').fill('第二站入口');
  await page.locator('[data-action="save-station-config"]').click();

  await page.locator('[data-action="station-background-input"]').setInputFiles({
    name: 'station-b-bg.png',
    mimeType: 'image/png',
    buffer: MOCK_IMAGE_BYTES,
  });

  await switchOpsStationTab(page, 'annotate');
  await page.locator('[data-action="enter-station-hotspot-create"]').click();
  const stage = page.locator('[data-scene-stage-role="editor"]');
  await expect(stage).toBeVisible();
  await page.evaluate(
    () => {
      const el = document.querySelector('[data-scene-stage-role="editor"]');
      if (!el) throw new Error('editor_stage_missing');
      const rect = el.getBoundingClientRect();
      const startX = rect.left + rect.width * 0.18;
      const startY = rect.top + rect.height * 0.2;
      const moveX = rect.left + rect.width * 0.38;
      const moveY = rect.top + rect.height * 0.42;
      el.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: startY, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: moveX, clientY: moveY, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: moveX, clientY: moveY, bubbles: true }));
    },
  );
  const createRequestPromise = page.waitForRequest((request) => {
    try {
      const url = new URL(request.url());
      return request.method() === 'POST' && url.pathname === '/api/pad/halls/current/stations/display_slot_2/hotspots';
    } catch (_) {
      return false;
    }
  });
  await pickHotspotProduct(page, 'Hydrophilic', 'product_002');
  const createRequest = await createRequestPromise;
  const requestBody = createRequest.postDataJSON();
  expect(requestBody.product_id).toBe('product_002');
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().sceneEditorCreateMode), { timeout: 5000 })
    .toBe(false);

  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.setMode?.('demo'));
  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.setDemoLeftTab?.('display_slot_2'));
  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.playProduct?.('product_002'));
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().selectedProductId || ''), { timeout: 5000 })
    .toBe('product_002');
  await captureEvidence(page, testInfo, 'ops-station-hotspot');
});

test('default editor state is not creating and blank stage click does not create hotspot', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'annotate');

  let state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.sceneEditorCreateMode).toBe(false);

  const stage = page.locator('[data-scene-stage-role="editor"]');
  await expect(stage).toBeVisible();
  await page.evaluate(() => {
    const el = document.querySelector('[data-scene-stage-role="editor"]');
    if (!el) throw new Error('editor_stage_missing');
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width * 0.7;
    const y = rect.top + rect.height * 0.7;
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
  });

  state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.sceneEditorCreateMode).toBe(false);
  expect(state.sceneEditorActiveHotspotId).toBe('');
});

test('new hotspot auto-saves after product selection and exits create mode', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'annotate');

  await page.locator('[data-action="enter-station-hotspot-create"]').click();
  let state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.sceneEditorCreateMode).toBe(true);
  expect(state.activeStationHotspotCount).toBe(5);

  const createRequestPromise = page.waitForRequest((request) => {
    try {
      const url = new URL(request.url());
      return request.method() === 'POST' && url.pathname === '/api/pad/halls/current/stations/display_slot_1/hotspots';
    } catch (_) {
      return false;
    }
  });

  const stage = page.locator('[data-scene-stage-role="editor"]');
  await page.evaluate(() => {
    const el = document.querySelector('[data-scene-stage-role="editor"]');
    if (!el) throw new Error('editor_stage_missing');
    const rect = el.getBoundingClientRect();
    const startX = rect.left + rect.width * 0.2;
    const startY = rect.top + rect.height * 0.25;
    const endX = rect.left + rect.width * 0.35;
    const endY = rect.top + rect.height * 0.4;
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: startY, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: endX, clientY: endY, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: endX, clientY: endY, bubbles: true }));
  });
  await pickHotspotProduct(page, 'Hydrophilic', 'product_002');
  const createRequest = await createRequestPromise;
  const requestBody = createRequest.postDataJSON();
  expect(requestBody.product_id).toBe('product_002');

  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().sceneEditorCreateMode), { timeout: 5000 })
    .toBe(false);
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().activeStationHotspotCount || 0), { timeout: 5000 })
    .toBe(6);
  state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.productHotspots.some((item) => item.productId === 'product_002')).toBe(true);
});

test('new hotspot can be saved unbound and stays red', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'annotate');

  await page.locator('[data-action="enter-station-hotspot-create"]').click();
  const createRequestPromise = page.waitForRequest((request) => {
    try {
      const url = new URL(request.url());
      return request.method() === 'POST' && url.pathname === '/api/pad/halls/current/stations/display_slot_1/hotspots';
    } catch (_) {
      return false;
    }
  });
  await drawEditorHotspot(page, 0.58, 0.26, 0.74, 0.44);
  await page.locator('[data-action="save-station-hotspot"]').click();

  const createRequest = await createRequestPromise;
  const requestBody = createRequest.postDataJSON();
  expect(requestBody.product_id).toBe('');
  expect(requestBody.manual_product_name).toBe('');
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().activeStationHotspotCount || 0), { timeout: 5000 })
    .toBe(6);

  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.setMode?.('demo'));
  await expect(page.locator('[data-action="play-product-hotspot"].pad-scene-hotspot--unbound')).toHaveCount(1);
});

test('manual placeholder hotspot can be completed later and turn green after audio generation', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'annotate');

  await page.locator('[data-action="enter-station-hotspot-create"]').click();
  const createRequestPromise = page.waitForRequest((request) => {
    try {
      const url = new URL(request.url());
      return request.method() === 'POST' && url.pathname === '/api/pad/halls/current/stations/display_slot_1/hotspots';
    } catch (_) {
      return false;
    }
  });
  await drawEditorHotspot(page, 0.18, 0.5, 0.34, 0.64);
  await page.locator('[data-action="station-hotspot-product-search"]').fill('Custom Placeholder');
  await page.locator('[data-action="save-station-hotspot"]').click();

  const createRequest = await createRequestPromise;
  const requestBody = createRequest.postDataJSON();
  expect(requestBody.manual_product_name).toBe('Custom Placeholder');

  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.setMode?.('demo'));
  const placeholderHotspot = page.locator('[data-action="play-product-hotspot"].pad-scene-hotspot--missing-audio');
  await expect(placeholderHotspot).toHaveCount(1);
  await placeholderHotspot.click();
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().selectedProductId || ''), { timeout: 3000 })
    .not.toBe('');
  const manualProductId = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().selectedProductId || '');
  expect(String(manualProductId || '')).toContain('manual_product_');

  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().audioError || ''), { timeout: 3000 })
    .toBe('该产品暂无生效讲解音频。');

  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'other');
  await page.locator('[data-action="product-name-draft"]').fill('Custom Placeholder Ready');
  await page.locator('[data-action="product-intro-draft"]').fill('Custom placeholder introduction');
  await page.locator('[data-action="save-product-info"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().syncTone || ''), { timeout: 8000 })
    .not.toBe('pending');
  await page.locator('[data-action="regenerate-audio"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().currentAudioText || ''), { timeout: 8000 })
    .toBe('Custom placeholder introduction');

  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.setMode?.('demo'));
  await expect(
    page.locator(`[data-action="play-product-hotspot"][data-product-id="${manualProductId}"]`)
  ).toHaveClass(/pad-scene-hotspot--has-audio/);
});

test('cross-hall hotspot binding keeps main list scoped but exposes referenced product playback', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page, {
    fixtureOverrides: {
      products: createBaseFixture().products.concat([
        {
          product_id: 'product_900',
          hall_id: 'hall_02',
          sort_order: 9,
          product_name: 'External Valve',
          product_name_en: 'External Valve',
          intro_text: 'External intro',
          registration_name: 'External registration',
          registration_number: 'REG-900',
          effective_date: '2026-02-01',
          company: 'External Co',
          product_source: 'imported',
          current_audio: {
            audio_asset_id: 'audio_900',
            source_type: 'recorded',
            text_snapshot: 'External valve narration',
            updated_at_ms: 1710000010900,
          },
          images: [],
        },
      ]),
    },
  });

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'annotate');

  await page.locator('[data-action="enter-station-hotspot-create"]').click();
  const createRequestPromise = page.waitForRequest((request) => {
    try {
      const url = new URL(request.url());
      return request.method() === 'POST' && url.pathname === '/api/pad/halls/current/stations/display_slot_1/hotspots';
    } catch (_) {
      return false;
    }
  });
  await drawEditorHotspot(page, 0.62, 0.52, 0.8, 0.68);
  await pickHotspotProduct(page, 'External', 'product_900');

  const createRequest = await createRequestPromise;
  expect(createRequest.postDataJSON().product_id).toBe('product_900');

  const state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.displayProductIds).not.toContain('product_900');
  expect(state.referencedProductIds).toContain('product_900');
});

test('hotspot product search input keeps focus while typing', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'annotate');

  await page.locator('[data-action="enter-station-hotspot-create"]').click();
  await drawEditorHotspot(page, 0.2, 0.2, 0.34, 0.36);
  const input = page.locator('[data-action="station-hotspot-product-search"]');
  await input.click();
  await input.type('E');

  await expect(page.locator('[data-action="station-hotspot-pick"]').first()).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(
          () => document.activeElement && document.activeElement.getAttribute('data-action')
        ),
      { timeout: 3000 }
    )
    .toBe('station-hotspot-product-search');
});

test('hotspot product search supports chinese composition input', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'annotate');

  await page.locator('[data-action="enter-station-hotspot-create"]').click();
  await drawEditorHotspot(page, 0.22, 0.18, 0.34, 0.32);

  await page.evaluate(() => {
    const input = document.querySelector('[data-action="station-hotspot-product-search"]');
    if (!input) throw new Error('hotspot_search_input_missing');
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart', { data: '造' }));
    input.value = '造';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new CompositionEvent('compositionend', { data: '造影' }));
    input.value = '造影';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await expect(page.locator('[data-action="station-hotspot-product-search"]')).toHaveValue('造影');
  await expect(page.locator('[data-action="station-hotspot-pick"]').first()).toBeVisible();
});

test('timeline editor creates a single highlight range only through scrubber dragging', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'settings');

  await expect(page.locator('[data-action="station-timeline-add-highlight-on"]')).toHaveCount(0);
  await expect(page.locator('[data-action="station-timeline-add-highlight-off"]')).toHaveCount(0);
  await expect(page.locator('[data-action="station-timeline-set-selection-start"]')).toHaveCount(0);
  await expect(page.locator('[data-action="station-timeline-set-selection-end"]')).toHaveCount(0);
  await expect(page.locator('[data-action="station-timeline-apply-selection"]')).toHaveCount(0);

  await page.locator('[data-action="play-station-slot-from-start"][data-slot-key="display_slot_1"]').first().click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const state = window.__RAGINT_PAD_E2E__?.getState?.() || {};
          return {
            slotKey: state.stationPlaybackSlotKey || '',
            status: state.stationPlaybackState || '',
          };
        }),
      { timeout: 5000 }
    )
    .toEqual({ slotKey: 'display_slot_1', status: 'playing' });

  await dragTimelineRange(page, 'display_slot_1', 0.2, 0.72);
  await expect(page.locator('[data-action="station-timeline-delete-highlight"][data-slot-key="display_slot_1"]')).toBeEnabled();
  await expect(page.locator('[data-action="station-timeline-drag-highlight-start"][data-slot-key="display_slot_1"]')).toHaveCount(1);
  await expect(page.locator('[data-action="station-timeline-drag-highlight-end"][data-slot-key="display_slot_1"]')).toHaveCount(1);
  await expect(page.locator('[data-action="station-timeline-time-ms"]')).toHaveCount(1);

  const state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.stationSlots[0].timelineEvents).toHaveLength(3);
  expect(state.stationSlots[0].timelineEvents.filter((item) => item.eventType === 'highlight_on')).toHaveLength(1);
  expect(state.stationSlots[0].timelineEvents.filter((item) => item.eventType === 'highlight_off')).toHaveLength(1);

  await dragTimelineRange(page, 'display_slot_1', 0.35, 0.82);
  const updatedState = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(updatedState.stationSlots[0].timelineEvents).toHaveLength(3);
  expect(updatedState.stationSlots[0].timelineEvents.filter((item) => item.eventType === 'highlight_on')).toHaveLength(1);
  expect(updatedState.stationSlots[0].timelineEvents.filter((item) => item.eventType === 'highlight_off')).toHaveLength(1);
});

test('timeline preview controls can start playback and resume from dragged playhead', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'settings');

  await page.locator('[data-action="play-station-slot-from-start"][data-slot-key="display_slot_1"]').first().click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const state = window.__RAGINT_PAD_E2E__?.getState?.() || {};
          return {
            slotKey: state.stationPlaybackSlotKey || '',
            status: state.stationPlaybackState || '',
          };
        }),
      { timeout: 5000 }
    )
    .toEqual({ slotKey: 'display_slot_1', status: 'playing' });

  await page.locator('[data-action="pause-station-playback"][data-slot-key="display_slot_1"]').first().click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const state = window.__RAGINT_PAD_E2E__?.getState?.() || {};
          return {
            slotKey: state.stationPlaybackSlotKey || '',
            status: state.stationPlaybackState || '',
          };
        }),
      { timeout: 3000 }
    )
    .toEqual({ slotKey: 'display_slot_1', status: 'paused' });

  await page.evaluate(() => {
    const playhead = document.querySelector('[data-action="station-timeline-drag-playhead"][data-slot-key="display_slot_1"]');
    const track = document.querySelector('[data-role="station-timeline-track"][data-slot-key="display_slot_1"]');
    if (!playhead || !track) throw new Error('timeline_playhead_missing');
    const playheadRect = playhead.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    const startX = playheadRect.left + playheadRect.width / 2;
    const y = trackRect.top + trackRect.height / 2;
    const targetX = trackRect.left + trackRect.width * 0.62;
    playhead.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: y, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: targetX, clientY: y, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: targetX, clientY: y, bubbles: true }));
  });

  await expect
    .poll(() => page.evaluate(() => Number(window.__RAGINT_PAD_E2E__?.getState?.().stationPlaybackCursorMs || 0)), { timeout: 3000 })
    .toBeGreaterThan(0);
  await expect(page.locator('[data-action="resume-station-playback"][data-slot-key="display_slot_1"]').first()).toBeEnabled();

  await page.locator('[data-action="resume-station-playback"][data-slot-key="display_slot_1"]').first().click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const state = window.__RAGINT_PAD_E2E__?.getState?.() || {};
          return {
            slotKey: state.stationPlaybackSlotKey || '',
            status: state.stationPlaybackState || '',
          };
        }),
      { timeout: 5000 }
    )
    .toEqual({ slotKey: 'display_slot_1', status: 'playing' });
  await expect
    .poll(() => page.evaluate(() => Number(window.__RAGINT_PAD_E2E__?.getState?.().stationPlaybackCursorMs || 0)), { timeout: 3000 })
    .toBeGreaterThan(0);
});

test('existing highlight range can be adjusted by handles and deleted', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page, { fixtureOverrides: createHighlightRangeFixture() });

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'settings');

  await expect(page.locator('[data-action="station-timeline-drag-highlight-start"][data-slot-key="display_slot_1"]')).toHaveCount(1);
  await expect(page.locator('[data-action="station-timeline-drag-highlight-end"][data-slot-key="display_slot_1"]')).toHaveCount(1);
  await expect(page.locator('[data-action="station-timeline-time-ms"]')).toHaveCount(1);

  await dragHighlightHandle(page, 'display_slot_1', 'start', 0.1);
  await dragHighlightHandle(page, 'display_slot_1', 'end', 0.85);

  let state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.stationSlots[0].timelineEvents.filter((item) => item.eventType === 'highlight_on')).toHaveLength(1);
  expect(state.stationSlots[0].timelineEvents.filter((item) => item.eventType === 'highlight_off')).toHaveLength(1);
  expect(
    state.stationSlots[0].timelineEvents.find((item) => item.eventType === 'highlight_on').timeMs
  ).toBeGreaterThanOrEqual(0);
  expect(
    state.stationSlots[0].timelineEvents.find((item) => item.eventType === 'highlight_off').timeMs
  ).toBeGreaterThan(
    state.stationSlots[0].timelineEvents.find((item) => item.eventType === 'highlight_on').timeMs
  );

  await page.locator('[data-action="station-timeline-delete-highlight"][data-slot-key="display_slot_1"]').click();
  await expect(page.locator('[data-action="station-timeline-drag-highlight-start"][data-slot-key="display_slot_1"]')).toHaveCount(0);

  state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.stationSlots[0].timelineEvents.filter((item) => item.eventType === 'highlight_on')).toHaveLength(0);
  expect(state.stationSlots[0].timelineEvents.filter((item) => item.eventType === 'highlight_off')).toHaveLength(0);
});

test('narration node editor saves node-level audio, range, and multi-hotspot binding', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page, { fixtureOverrides: createNarrationNodeFixture() });

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'settings');

  await expect(page.locator('[data-action="select-narration-node"]')).toHaveCount(1);
  await dragNarrationNodeRange(page, 'display_slot_1', 'narration_node_a_1', 0.25, 0.8);
  await page.locator('[data-action="toggle-narration-node-hotspot"][data-hotspot-id="station_hotspot_a_2"]').click();

  const saveRequest = page.waitForRequest((request) => {
    try {
      const url = new URL(request.url());
      return request.method() === 'PUT' && url.pathname === '/api/pad/halls/current/stations/display_slot_1/timeline';
    } catch (_) {
      return false;
    }
  });
  await page.locator('[data-action="save-station-config"]').first().click();
  const payload = await saveRequest.then((request) => request.postDataJSON());

  expect(Array.isArray(payload.narration_nodes)).toBe(true);
  expect(payload.narration_nodes[0].recording_id).toBe('recording_station_a');
  expect(payload.narration_nodes[0].hotspot_ids).toEqual(
    expect.arrayContaining(['station_hotspot_a_1', 'station_hotspot_a_2'])
  );

  const state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.stationSlots[0].narrationNodes).toHaveLength(1);
  expect(state.stationSlots[0].narrationNodes[0].hotspotIds).toEqual(
    expect.arrayContaining(['station_hotspot_a_1', 'station_hotspot_a_2'])
  );
});

test.fixme('narration playback only shows bound hotspots inside the highlight interval', async ({ page }) => {
  await installClientIdOnly(page, 'pad-a');
  await installPadApiMocks(page, { fixtureOverrides: createNarrationNodeFixture() });

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'settings');
  await expect(page.locator('[data-action="play-narration-node-highlight"][data-node-id="narration_node_a_1"]')).toBeVisible();
  await page.locator('[data-action="play-narration-node-highlight"][data-node-id="narration_node_a_1"]').click();

  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().stationPlaybackState || ''), { timeout: 5000 })
    .toBe('playing');

  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().visibleHotspotIds || []), { timeout: 5000 })
    .toContain('station_hotspot_a_1');
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().flashingHotspotIds || []), { timeout: 5000 })
    .toContain('station_hotspot_a_1');

  await expect
    .poll(() => page.evaluate(() => Number(window.__RAGINT_PAD_E2E__?.getState?.().stationPlaybackCursorMs || 0)), { timeout: 5000 })
    .toBeGreaterThan(750);
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().visibleHotspotIds || []), { timeout: 5000 })
    .toEqual([]);
});

test('draft hotspot can be resized before it is saved', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'annotate');

  await page.locator('[data-action="enter-station-hotspot-create"]').click();
  await drawEditorHotspot(page, 0.24, 0.28, 0.34, 0.38);

  const draftHotspot = page.locator('[data-action="scene-editor-hotspot"][data-hotspot-id="__draft__"]');
  const resizeHandle = page.locator('[data-action="scene-editor-hotspot-resize"][data-hotspot-id="__draft__"]');
  await expect(draftHotspot).toBeVisible();
  const beforeStyle = await draftHotspot.getAttribute('style');

  await page.evaluate(() => {
    const node = document.querySelector('[data-action="scene-editor-hotspot-resize"][data-hotspot-id="__draft__"]');
    if (!node) throw new Error('draft_resize_missing');
    const rect = node.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const endX = startX + 120;
    const endY = startY + 90;
    node.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: startY, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: endX, clientY: endY, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: endX, clientY: endY, bubbles: true }));
  });

  await expect(draftHotspot).not.toHaveAttribute('style', beforeStyle || '');
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().sceneEditorCreateMode), { timeout: 3000 })
    .toBe(false);
});

test('selecting existing hotspot exits create mode', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'annotate');

  await page.locator('[data-action="enter-station-hotspot-create"]').click();
  await page.evaluate(() => {
    const node = document.querySelector('[data-action="scene-editor-hotspot"][data-hotspot-id="station_hotspot_a_1"]');
    if (!node) throw new Error('existing_hotspot_missing');
    node.click();
  });

  const state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.sceneEditorCreateMode).toBe(false);
  expect(state.sceneEditorActiveHotspotId).toBe('station_hotspot_a_1');
});

test('cancel exits create mode', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'annotate');

  await page.locator('[data-action="enter-station-hotspot-create"]').click();
  await page.evaluate(() => {
    const el = document.querySelector('[data-scene-stage-role="editor"]');
    if (!el) throw new Error('editor_stage_missing');
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width * 0.3;
    const y = rect.top + rect.height * 0.3;
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
  });
  await page.locator('[data-action="clear-station-hotspot-draft"]').click();

  const state = await page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.());
  expect(state.sceneEditorCreateMode).toBe(false);
  expect(state.sceneEditorActiveHotspotId).toBe('');
});

test('ops product management still supports TTS regeneration and image upload', async ({ page }, testInfo) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'other');

  await page.locator('[data-product-id="product_002"]').click();
  await expect(page.getByTestId('audio-text-editor')).toHaveValue('亲水涂层造影导管默认 TTS 讲解');
  await page.getByTestId('audio-text-editor').fill('更新后的亲水涂层造影导管讲解');
  await page.locator('[data-action="regenerate-audio"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().currentAudioText || ''), { timeout: 8000 })
    .toBe('更新后的亲水涂层造影导管讲解');

  await page.locator('[data-action="upload-image-input"]').setInputFiles({
    name: 'product-image.png',
    mimeType: 'image/png',
    buffer: MOCK_IMAGE_BYTES,
  });
  await expect
    .poll(() => page.evaluate(() => (window.__RAGINT_PAD_E2E__?.getState?.().currentImageAssetIds || []).length), { timeout: 8000 })
    .toBeGreaterThan(0);
  await captureEvidence(page, testInfo, 'ops-product-regression');
});

test('ops layout fits in a single screen without page scrolling', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);

  await expect(page.locator('.pad-shell--ops')).toBeVisible();
  await expect(page.locator('.pad-ops-unified-shell')).toBeVisible();
  await expect(page.locator('.pad-ops-control-sidebar')).toBeVisible();
  await expect(page.locator('.pad-ops-control-sidebar [data-action="save-station-config"]')).toBeVisible();
  await expect(page.locator('.pad-ops-control-sidebar [data-action="enter-station-hotspot-create"]')).toBeVisible();
  await expect(page.locator('[data-action="save-product-info"]')).toHaveCount(0);
  await expect(page.locator('[data-action="select-upload-image"]')).toHaveCount(0);

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('.pad-shell--ops');
    return {
      innerHeight: window.innerHeight,
      docScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
      shellClientHeight: shell ? shell.clientHeight : 0,
      shellScrollHeight: shell ? shell.scrollHeight : 0,
      pageScrollable: window.innerHeight < document.documentElement.scrollHeight - 1,
    };
  });

  expect(metrics.pageScrollable).toBe(false);
  expect(metrics.docScrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
  expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
  expect(metrics.shellScrollHeight).toBeLessThanOrEqual(metrics.shellClientHeight + 1);

  await captureEvidence(page, testInfo, 'ops-single-screen');
});

test('ops compact layout still supports product editing and TTS regeneration', async ({ page }, testInfo) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);
  await switchOpsStationTab(page, 'other');

  await page.locator('[data-product-id="product_002"]').click();
  await expect(page.getByTestId('audio-text-editor')).toHaveValue('亲水涂层造影导管默认 TTS 讲解');
  await page.getByTestId('audio-text-editor').fill('更新后的亲水涂层造影导管讲解');
  await page.locator('[data-action="regenerate-audio"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().currentAudioText || ''), { timeout: 8000 })
    .toBe('更新后的亲水涂层造影导管讲解');

  await page.locator('[data-action="product-name-draft"]').fill('亲水涂层造影导管（运维修订）');
  await page.locator('[data-action="product-intro-draft"]').fill('新的单屏运维布局下，产品说明仍可直接维护。');
  const saveProductRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return request.method() === 'PUT' && url.pathname === '/api/pad/products/product_002';
  });
  await page.locator('[data-action="save-product-info"]').click();
  const saveProductPayload = await saveProductRequest.then((request) => request.postDataJSON());
  expect(saveProductPayload.product_name).toContain('运维修订');
  expect(saveProductPayload.intro_text).toContain('单屏运维布局');

  await captureEvidence(page, testInfo, 'ops-compact-product-edit');
});

test('ops station area separates hotspot annotation and station settings tabs', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);

  await expect(page.locator('[data-action="set-ops-station-tab"][data-tab="annotate"]').last()).toBeVisible();
  await expect(page.locator('[data-action="set-ops-station-tab"][data-tab="settings"]').last()).toBeVisible();
  await expect(page.locator('[data-action="set-ops-station-tab"][data-tab="other"]').last()).toBeVisible();
  await expect(page.locator('.pad-scene-stage--ops-editor')).toBeVisible();
  await expect(page.locator('.pad-scene-stage--ops-editor')).toHaveClass(/is-stretched/);
  await expect(page.locator('[data-action="enter-station-hotspot-create"]')).toBeVisible();
  await expect(page.locator('.pad-ops-product-panel')).toHaveCount(0);
  await expect(page.locator('.pad-ops-detail-panel')).toHaveCount(0);

  await switchOpsStationTab(page, 'settings');
  await expect(page.locator('.pad-ops-product-panel')).toHaveCount(0);
  await expect(page.locator('.pad-ops-detail-panel')).toHaveCount(0);
  await expect(page.getByText('站点讲解节点')).toBeVisible();
  await expect(page.locator('[data-action="save-station-config"]').first()).toBeVisible();
  await expect(page.locator('[data-action="enter-station-hotspot-create"]')).toHaveCount(0);

  await switchOpsStationTab(page, 'other');
  await expect(page.locator('.pad-ops-product-panel')).toHaveCount(1);
  await expect(page.locator('.pad-ops-detail-panel')).toHaveCount(1);
  await expect(page.locator('[data-action="save-product-info"]')).toBeVisible();
});

test('ops shared control sidebar stays visible while switching workspaces', async ({ page }) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);

  const controlSidebar = page.locator('.pad-ops-control-sidebar');
  await expect(controlSidebar).toBeVisible();
  await expect(controlSidebar.locator('[data-action="reload-live"]')).toBeVisible();
  await expect(controlSidebar.locator('[data-action="switch-hall"]')).toHaveCount(8);

  await switchOpsStationTab(page, 'settings');
  await expect(controlSidebar).toBeVisible();
  await expect(page.locator('[data-action="station-slot-recording"]')).toBeVisible();

  await switchOpsStationTab(page, 'other');
  await expect(controlSidebar).toBeVisible();
  await expect(page.locator('.pad-ops-product-panel')).toHaveCount(1);
  await expect(page.locator('[data-action="save-product-info"]')).toBeVisible();
});

test('mobile work area switcher stays fixed at the top while switching tabs', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await switchToOpsMode(page);

  const mobileSwitcher = page.locator('.pad-ops-mobile-workspace-switcher');
  const legacyWorkspaceSection = page.locator('.pad-ops-control-overview__section--workspace');
  const controlOverview = page.locator('.pad-ops-control-overview');

  await expect(mobileSwitcher).toBeVisible();
  await expect(controlOverview).toBeVisible();
  await expect(legacyWorkspaceSection).toBeHidden();

  const initialTop = await mobileSwitcher.evaluate((node) => Math.round(node.getBoundingClientRect().top));
  const controlTop = await controlOverview.evaluate((node) => Math.round(node.getBoundingClientRect().top));
  expect(initialTop).toBeLessThan(controlTop);

  await switchOpsStationTab(page, 'settings');
  await expect(page.locator('[data-action="station-slot-recording"]')).toBeVisible();
  const settingsTop = await mobileSwitcher.evaluate((node) => Math.round(node.getBoundingClientRect().top));
  expect(settingsTop).toBe(initialTop);

  await switchOpsStationTab(page, 'other');
  await expect(page.locator('[data-action="save-product-info"]')).toBeVisible();
  const otherTop = await mobileSwitcher.evaluate((node) => Math.round(node.getBoundingClientRect().top));
  expect(otherTop).toBe(initialTop);
});

test('offline snapshot preserves station visuals and hotspot playback', async ({ page }, testInfo) => {
  await installClientIdAndAudioStub(page, 'pad-a');
  await installPadApiMocks(page);

  await page.goto('/');
  await waitForOfflineReady(page);
  await page.reload();
  await page.context().setOffline(true);
  await page.goto('/');

  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().usingOfflineSnapshot || false), { timeout: 7000 })
    .toBe(true);
  await expect(page.locator('.pad-scene-stage')).toBeVisible();

  await page.evaluate(() => window.__RAGINT_PAD_E2E__?.playProduct?.('product_001'));
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_PAD_E2E__?.getState?.().lastPlaybackRequestedUrl || ''), { timeout: 5000 })
    .toContain('/api/pad/offline/audio/audio_001');
  await captureEvidence(page, testInfo, 'offline-station-playback');
});
