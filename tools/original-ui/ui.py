"""ui.py FILE ROOTNAME [depth]: the NGUI widgets under a named object of one asset file: local position, size, pivot, colour, sprite, label text / font size.
Script fields are read with type trees generated from the game's own Managed DLLs."""
import os, sys
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get('DUEL_DATA') or os.path.join(HERE, 'apk', 'assets', 'bin', 'Data')   # the APK's assets/bin/Data, unzipped
fname, root, depth = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 9
env = UnityPy.load(*[os.path.join(DATA, f) for f in (fname, 'globalgamemanagers', 'globalgamemanagers.assets')]) if fname.startswith('level') else UnityPy.load(DATA)
AF = {}
for o in env.objects: AF.setdefault(o.assets_file.name.lower(), o.assets_file)
gen = TypeTreeGenerator(env.objects[0].assets_file.unity_version.__str__() if hasattr(env.objects[0].assets_file, 'unity_version') else '5.6.4f1')
gen.load_local_dll_folder(os.path.join(DATA, 'Managed'))
KEEP = ('mWidth', 'mHeight', 'mPivot', 'mColor', 'mSpriteName', 'mText', 'mFontSize', 'mDepth', 'mType', 'manualHeight', 'manualWidth', 'minimumHeight', 'maximumHeight', 'scalingStyle', 'fitWidth', 'fitHeight',
        'cellWidth', 'cellHeight', 'maxPerLine', 'arrangement', 'mClipping', 'mClipRange', 'mClipSoftness', 'mOverflow', 'mAlignment', 'mEffectStyle', 'mSpacingX', 'mSpacingY', 'mMaxLineCount', 'movement', 'leftAnchor', 'rightAnchor', 'bottomAnchor', 'topAnchor', 'mSize', 'center', 'size', 'FrontSize', 'BackSize', 'CostSize')


def comp(c):
    return c[1] if isinstance(c, tuple) else getattr(c, 'component', c)


def fmt(v):
    if hasattr(v, 'r'): return '#%02x%02x%02x/%.2f' % (round(v.r * 255), round(v.g * 255), round(v.b * 255), v.a)
    if hasattr(v, 'target'): return ('anchor(rel=%s abs=%s)' % (v.relative, v.absolute)) if getattr(v.target, 'm_PathID', 0) else None
    if hasattr(v, 'x'): return tuple(round(getattr(v, k), 3) for k in 'xyzw' if hasattr(v, k))
    return v


def fmt2(v):
    if isinstance(v, dict):
        if 'r' in v: return '#%02x%02x%02x/%.2f' % (round(v['r'] * 255), round(v['g'] * 255), round(v['b'] * 255), v['a'])
        if 'target' in v: return ('anchor(rel=%s abs=%s)' % (v['relative'], v['absolute'])) if v['target'].get('m_PathID') else None
        if 'width' in v: return (v['x'], v['y'], v['width'], v['height'])
        if 'x' in v: return tuple(round(v[k], 3) for k in 'xyzw' if k in v)
    return v


def show(tr, d, ind=0):
    go = tr.m_GameObject.read(); p, s = tr.m_LocalPosition, tr.m_LocalScale
    line = '  ' * ind + go.m_Name + ('' if go.m_IsActive else ' (off)') + '  p=(%g, %g)' % (round(p.x, 2), round(p.y, 2)) + ('' if abs(s.x - 1) < 1e-3 and abs(s.y - 1) < 1e-3 else ' s=(%g, %g)' % (round(s.x, 3), round(s.y, 3)))
    print(line)
    for c in go.m_Component:
        c = comp(c)
        try:
            if c.type.name != 'MonoBehaviour':
                if c.type.name == 'BoxCollider':
                    b = c.read(); print('  ' * ind + '    [BoxCollider] size=%s center=%s' % (fmt(b.m_Size), fmt(b.m_Center)))
                continue
            home = AF[fname.lower()]; c = home.objects[c.m_PathID]
            base = c.read(check_read=False); sp = base.m_Script
            af = home if sp.m_FileID == 0 else AF[home.externals[sp.m_FileID - 1].name.lower()]
            sc = af.objects[sp.m_PathID].read()
            full = (sc.m_Namespace + '.' if sc.m_Namespace else '') + sc.m_ClassName
            m = c.read_typetree(gen.get_nodes_up(sc.m_AssemblyName, full), wrap=False, check_read=False)
            vals = {k: fmt2(m[k]) for k in KEEP if k in m}
            vals = {k: v for k, v in vals.items() if v is not None}
            print('  ' * ind + '    [%s] %s' % (sc.m_ClassName, ' '.join('%s=%r' % kv for kv in vals.items())))
        except Exception as x:
            global TB
            if not globals().get('TB'):
                TB = 1; import traceback; traceback.print_exc(file=sys.stdout)
            print('  ' * ind + '    [?] ' + str(x)[:80])
    if d > 0:
        for k in tr.m_Children: show(k.read(), d - 1, ind + 1)


for o in env.objects:
    if o.type.name == 'GameObject':
        g = o.read()
        if g.m_Name in root.split(',') and o.assets_file.name == fname:
            t = next(comp(c) for c in g.m_Component if comp(c).type.name in ('Transform', 'RectTransform')).read()
            print('==', o.assets_file.name); show(t, depth)
