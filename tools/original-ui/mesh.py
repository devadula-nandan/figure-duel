"""Mesh bounds (centre, extent) of every MeshFilter whose GameObject name contains one of the given words."""
import os, sys
import UnityPy
DATA = os.environ.get('DUEL_DATA') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'apk', 'assets', 'bin', 'Data')
words = [w.lower() for w in sys.argv[1:]]
env = UnityPy.load(DATA)
for o in env.objects:
    if o.type.name != 'MeshFilter':
        continue
    try:
        d = o.read(); go = d.m_GameObject.read()
        if not any(w in go.m_Name.lower() for w in words):
            continue
        m = d.m_Mesh.read(); b = m.m_LocalAABB
        c, e = b.m_Center, b.m_Extent
        print(o.assets_file.name[:14], go.m_Name, '| mesh', m.m_Name, '| centre', (round(c.x, 3), round(c.y, 3), round(c.z, 3)), 'extent', (round(e.x, 3), round(e.y, 3), round(e.z, 3)))
    except Exception as x:
        print('ERR', x)
