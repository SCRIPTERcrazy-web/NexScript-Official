// utils/scriptCode.js
export async function loadScriptCode(script) {
  if (!script) return null;

  // ScriptBlox: kode udah ada di respons detail
  if (script.source === 'ScriptBlox') {
    return script.script; // string lua
  }

  // RScripts: fetch .txt (CORS terbuka, no auth, cache 1 jam)
  if (script.source === 'RScripts' && script.rawScriptUrl) {
    try {
      const res = await fetch(script.rawScriptUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      console.error('Gagal fetch raw script:', e);
      return null;
    }
  }

  return null;
}
