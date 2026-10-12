// One copy of the original rule engine per worker. Messages: {lib: ArrayBuffer} once, then {id, text} -> {id, out} | {id, error}.
importScripts('vendor/unicorn_arm.js', 'tfg.js');
let lib = null, engine = null;
onmessage = async e => {
  if (e.data.lib) { lib = new Uint8Array(e.data.lib); try { engine = await createTFG(MUnicorn, lib); postMessage({ ready: true }); } catch (x) { postMessage({ ready: false, error: String(x && x.message || x) }); } return; }
  try { postMessage({ id: e.data.id, out: engine.cmd(e.data.text) }); }
  catch (x) { postMessage({ id: e.data.id, error: String(x && x.message || x) }); try { engine = await createTFG(MUnicorn, lib); } catch (y) {} }   // an aborted instance is rebuilt
};
