// Godot 4 binary-token GDScript (.gdc) -> readable .gd text.
//   node gdc.js <in.gdc|dir> [outdir]     (dir: converts every .gdc recursively, writes .gd beside it or under outdir)
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const T = ['EMPTY', 'ANNOTATION', 'IDENTIFIER', 'LITERAL', '<', '<=', '>', '>=', '==', '!=', 'and', 'or', 'not', '&&', '||', '!',
  '&', '|', '~', '^', '<<', '>>', '+', '-', '*', '**', '/', '%', '=', '+=', '-=', '*=', '**=', '/=', '%=', '<<=', '>>=', '&=', '|=', '^=',
  'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'pass', 'return', 'match', 'when',
  'as', 'assert', 'await', 'breakpoint', 'class', 'class_name', 'const', 'enum', 'extends', 'func', 'in', 'is', 'namespace', 'preload',
  'self', 'signal', 'static', 'super', 'trait', 'var', 'void', 'yield',
  '[', ']', '{', '}', '(', ')', ',', ';', '.', '..', '...', ':', '$', '->', '_',
  'NEWLINE', 'INDENT', 'DEDENT', 'PI', 'TAU', 'INF', 'NAN', 'VCS_CONFLICT_MARKER', '`', '?', 'ERROR', 'EOF'];

function decodeVariant(b, o) {
  const hdr = b.readUInt32LE(o); o += 4;
  const type = hdr & 0xff, f64 = !!(hdr & (1 << 16));
  const str = () => { const n = b.readUInt32LE(o); o += 4; const s = b.toString('utf8', o, o + n); o += n + ((4 - (n % 4)) % 4); return s; };
  const floats = n => { const a = []; for (let i = 0; i < n; i++) { a.push(f64 ? b.readDoubleLE(o) : b.readFloatLE(o)); o += f64 ? 8 : 4; } return a; };
  const ints = n => { const a = []; for (let i = 0; i < n; i++) { a.push(b.readInt32LE(o)); o += 4; } return a; };
  const fl = v => Number.isInteger(v) ? v.toFixed(1) : String(v);
  let v;
  switch (type) {
    case 0: v = 'null'; break;
    case 1: v = b.readUInt32LE(o) ? 'true' : 'false'; o += 4; break;
    case 2: if (f64) { v = String(b.readBigInt64LE(o)); o += 8; } else { v = String(b.readInt32LE(o)); o += 4; } break;
    case 3: { const x = f64 ? b.readDoubleLE(o) : b.readFloatLE(o); o += f64 ? 8 : 4; v = fl(f64 ? x : +x.toPrecision(7)); break; }
    case 4: v = JSON.stringify(str()); break;
    case 5: v = `Vector2(${floats(2).map(fl)})`; break;
    case 6: v = `Vector2i(${ints(2)})`; break;
    case 9: v = `Vector3(${floats(3).map(fl)})`; break;
    case 10: v = `Vector3i(${ints(3)})`; break;
    case 20: { const a = []; for (let i = 0; i < 4; i++) { a.push(fl(+b.readFloatLE(o).toPrecision(7))); o += 4; } v = `Color(${a})`; break; }
    case 21: v = '&' + JSON.stringify(str()); break;
    case 22: {
      let n = b.readUInt32LE(o); o += 4;
      if (n & 0x80000000) {
        n &= 0x7fffffff; const sub = b.readUInt32LE(o); o += 4; const flags = b.readUInt32LE(o); o += 4;
        const parts = []; for (let i = 0; i < n + sub; i++) parts.push(str());
        v = '^' + JSON.stringify((flags & 1 ? '/' : '') + parts.slice(0, n).join('/') + (sub ? ':' + parts.slice(n).join(':') : ''));
      } else { o -= 4; v = '^' + JSON.stringify(str()); }
      break;
    }
    default: throw new Error('unsupported variant type ' + type + ' at ' + o);
  }
  return [v, o];
}

function decompile(buf) {
  if (buf.toString('latin1', 0, 4) !== 'GDSC') throw new Error('not GDSC');
  const ver = buf.readUInt32LE(4), dsz = buf.readUInt32LE(8);
  const b = dsz ? zlib.zstdDecompressSync(buf.subarray(12)) : buf.subarray(12);
  const nId = b.readUInt32LE(0), nConst = b.readUInt32LE(4), nLines = b.readUInt32LE(8);
  const nTok = b.readUInt32LE(ver >= 101 ? 12 : 16);
  let o = ver >= 101 ? 16 : 20;
  const ids = [];
  for (let i = 0; i < nId; i++) {
    const len = b.readUInt32LE(o); o += 4; let s = '';
    for (let j = 0; j < len; j++) s += String.fromCodePoint((b.readUInt32LE(o + j * 4) ^ 0xb6b6b6b6) >>> 0);
    o += len * 4; ids.push(s);
  }
  const consts = [];
  for (let i = 0; i < nConst; i++) { const r = decodeVariant(b, o); consts.push(r[0]); o = r[1]; }
  const lines = new Map(), cols = new Map();
  for (let i = 0; i < nLines; i++) { lines.set(b.readUInt32LE(o), b.readUInt32LE(o + 4)); o += 8; }
  for (let i = 0; i < nLines; i++) { cols.set(b.readUInt32LE(o), b.readUInt32LE(o + 4)); o += 8; }
  let out = '', prev = null;
  const noSpaceBefore = new Set([')', ']', ',', '.', ':', '(', '[', ';', '}']);
  const noSpaceAfter = new Set(['(', '[', '.', '$', '!', '~', '{']);
  const kwBeforeParen = new Set(['if', 'elif', 'while', 'for', 'in', 'and', 'or', 'not', 'return', 'await', '=', '==', '!=', '<', '>', '<=', '>=', '+', '-', '*', '/', '%', ',', ':', '->', 'as', 'is', 'when', 'match', 'else', '+=', '-=', '*=', '/=', '**', '&', '|', '^', '<<', '>>', '&&', '||', '..', 'assert', 'var', 'const', '%=', '|=', '&=']);
  for (let i = 0; i < nTok; i++) {
    let raw, type, idx = 0;
    if (b[o] & 0x80) { raw = b.readUInt32LE(o); type = raw & 0x7f; idx = raw >>> 8; o += 8; } else { type = b[o]; o += 5; }
    let s = T[type] === undefined ? `<T${type}>` : T[type];
    if (type === 1) s = ids[idx];            // annotation (already includes '@')
    else if (type === 2) s = ids[idx];
    else if (type === 3) s = consts[idx];
    else if (type === 98) s = `<ERROR ${consts[idx]}>`;
    if (lines.has(i)) {
      if (i > 0) out += '\n';
      out += ' '.repeat(Math.max(0, cols.get(i) - 1));
    } else if (prev !== null) {
      let sp = true;
      if (noSpaceBefore.has(s)) sp = false;
      if (noSpaceAfter.has(prev)) sp = false;
      if ((s === '(' || s === '[') && kwBeforeParen.has(prev)) sp = true;
      if (s === '{' ) sp = prev !== '(' && prev !== '[';
      if (s === ':' ) sp = false;
      if (prev === '@' ) sp = false;
      if (sp) out += ' ';
    }
    out += s; prev = s;
  }
  return out + '\n';
}

function walk(p, acc) {
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name);
    if (e.isDirectory()) walk(f, acc); else if (f.endsWith('.gdc')) acc.push(f);
  }
  return acc;
}

const lp = p => (process.platform === 'win32' && !p.startsWith('\\\\?\\')) ? '\\\\?\\' + path.resolve(p) : p;
const src = lp(process.argv[2]), outdir = process.argv[3] ? lp(process.argv[3]) : null;
if (fs.statSync(src).isDirectory()) {
  let ok = 0, bad = 0;
  for (const f of walk(src, [])) {
    const dst = (outdir ? path.join(outdir, path.relative(src, f)) : f).replace(/\.gdc$/, '.gd');
    try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, decompile(fs.readFileSync(f))); ok++; }
    catch (e) { bad++; console.error('FAIL', path.relative(src, f), e.message); }
  }
  console.log('ok', ok, 'failed', bad);
} else process.stdout.write(decompile(fs.readFileSync(src)));
