from __future__ import annotations


OPS_CONSOLE_HTML = """
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RagInt Ops</title>
    <style>
      body{font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; margin:16px; color:#111;}
      .row{display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:12px;}
      input,textarea,button{font:inherit; padding:8px;}
      textarea{width:100%; height:160px;}
      pre{background:#f6f8fa; padding:12px; overflow:auto; border-radius:6px;}
      .muted{color:#666; font-size:12px;}
      .btn{cursor:pointer;}
    </style>
  </head>
  <body>
    <h2>RagInt Ops Console</h2>
    <div class="row">
      <label>Ops Token锛堝彲閫夛級锛?input id="token" placeholder="X-Ops-Token" /></label>
      <button class="btn" id="refresh">鍒锋柊璁惧鍒楄〃</button>
    </div>

    <h3>璁惧鍒楄〃</h3>
    <div class="muted">鎺ュ彛锛欸ET /api/ops/devices</div>
    <pre id="devices">{}</pre>

    <h3>涓嬪彂閰嶇疆锛圡VP锛?/h3>
    <div class="row">
      <label>device_id锛?input id="deviceId" placeholder="d1" /></label>
      <button class="btn" id="loadCfg">璇诲彇褰撳墠閰嶇疆</button>
      <button class="btn" id="pushCfg">涓嬪彂閰嶇疆</button>
    </div>
    <div class="muted">鎺ュ彛锛欸ET/POST /api/ops/config</div>
    <textarea id="cfg" spellcheck="false">{}</textarea>
    <pre id="cfgOut"></pre>

    <script>
      const $ = (id) => document.getElementById(id);
      const tokenKey = 'ragint_ops_token';
      $('token').value = localStorage.getItem(tokenKey) || '';
      $('token').addEventListener('change', () => localStorage.setItem(tokenKey, $('token').value || ''));

      function headers() {
        const h = { 'Content-Type': 'application/json' };
        const t = String($('token').value || '').trim();
        if (t) h['X-Ops-Token'] = t;
        return h;
      }

      async function refreshDevices() {
        const r = await fetch('/api/ops/devices', { headers: headers() });
        const j = await r.json();
        $('devices').textContent = JSON.stringify(j, null, 2);
      }

      async function loadConfig() {
        const did = String($('deviceId').value || '').trim();
        if (!did) return alert('device_id required');
        const r = await fetch('/api/ops/config?device_id=' + encodeURIComponent(did), { headers: headers() });
        const j = await r.json();
        $('cfgOut').textContent = JSON.stringify(j, null, 2);
        $('cfg').value = JSON.stringify(j && j.config ? j.config : {}, null, 2);
      }

      async function pushConfig() {
        const did = String($('deviceId').value || '').trim();
        if (!did) return alert('device_id required');
        let cfg = {};
        try { cfg = JSON.parse($('cfg').value || '{}'); } catch (e) { return alert('config JSON invalid'); }
        const r = await fetch('/api/ops/config', { method: 'POST', headers: headers(), body: JSON.stringify({ device_id: did, config: cfg }) });
        const j = await r.json();
        $('cfgOut').textContent = JSON.stringify(j, null, 2);
        await refreshDevices();
      }

      $('refresh').addEventListener('click', refreshDevices);
      $('loadCfg').addEventListener('click', loadConfig);
      $('pushCfg').addEventListener('click', pushConfig);

      refreshDevices().catch(() => {});
    </script>
  </body>
</html>
""".strip()


def render_ops_console():
    return OPS_CONSOLE_HTML, 200, {"Content-Type": "text/html; charset=utf-8"}
