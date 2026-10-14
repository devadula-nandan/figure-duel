"""sprite_colour.py NAME...: the average colour (and a few sample pixels) of named sprites in the original's NGUI atlases.
Reads the colour only; nothing of the artwork is written out."""
import os, sys
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get('DUEL_DATA') or os.path.join(HERE, 'apk', 'assets', 'bin', 'Data')
want = set(sys.argv[1:])
env = UnityPy.load(DATA)
gen = TypeTreeGenerator('5.3.8f2'); gen.load_local_dll_folder(os.path.join(DATA, 'Managed'))
AF = {}
for o in env.objects: AF.setdefault(o.assets_file.name.lower(), o.assets_file)


def deref(home, ptr):
    fid, pid = (ptr['m_FileID'], ptr['m_PathID']) if isinstance(ptr, dict) else (ptr.m_FileID, ptr.m_PathID)
    if not pid: return None, None
    af = home if fid == 0 else AF.get(home.externals[fid - 1].name.lower())
    return (af, af.objects.get(pid)) if af else (None, None)


for o in env.objects:
    if o.type.name != 'MonoBehaviour': continue
    try:
        home = o.assets_file; base = o.read(check_read=False)
        saf, sobj = deref(home, base.m_Script)
        if not sobj or sobj.read().m_ClassName != 'UIAtlas': continue
        sc = sobj.read(); atlas = o.read_typetree(gen.get_nodes_up(sc.m_AssemblyName, sc.m_ClassName), wrap=False, check_read=False)
        hits = [sp for sp in atlas.get('mSprites', []) if sp['name'] in want]
        if not hits: continue
        maf, mobj = deref(home, atlas['material']); mat = mobj.read()
        tex = None
        for k, v in mat.m_SavedProperties.m_TexEnvs:
            name = k if isinstance(k, str) else getattr(k, 'name', '')
            if name == '_MainTex': taf, tobj = deref(maf, v.m_Texture); tex = tobj.read().image.convert('RGBA')
        for sp in hits:
            im = tex.crop((sp['x'], sp['y'], sp['x'] + sp['width'], sp['y'] + sp['height'])); px = [p for p in im.getdata() if p[3] > 128]
            avg = tuple(sum(p[i] for p in px) // max(1, len(px)) for i in range(3))
            mid = [im.getpixel((int(im.width * f), im.height // 2)) for f in (.1, .3, .5, .7, .9)]
            print(sp['name'], '%dx%d' % (sp['width'], sp['height']), 'average #%02x%02x%02x' % avg, 'across the middle', ['#%02x%02x%02x/%d' % p for p in mid])
    except Exception as x:
        print('ERR', type(x).__name__, str(x)[:100])
