"""Index the original APK's Unity data once (GameObject names, transforms, parents) into a pickle, then answer queries from it."""
import os, pickle, sys
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get('DUEL_DATA') or os.path.join(HERE, 'apk', 'assets', 'bin', 'Data')   # the APK's assets/bin/Data, unzipped
IDX = os.path.join(HERE, 'unity_index.pkl')


def build():
    import UnityPy
    env = UnityPy.load(DATA)
    gos, trs, monos = {}, {}, {}
    for o in env.objects:
        key = (o.assets_file.name, o.path_id)
        try:
            if o.type.name == 'GameObject':
                d = o.read()
                gos[key] = {'name': d.m_Name, 'active': d.m_IsActive, 'comps': [(c.m_FileID, c.m_PathID) if hasattr(c, 'm_PathID') else None for c in [getattr(x, 'component', x) for x in d.m_Component]]}
            elif o.type.name in ('Transform', 'RectTransform'):
                d = o.read()
                p, r, s = d.m_LocalPosition, d.m_LocalRotation, d.m_LocalScale
                trs[key] = {'go': d.m_GameObject.m_PathID, 'father': d.m_Father.m_PathID, 'kids': [c.m_PathID for c in d.m_Children],
                            'p': (p.x, p.y, p.z), 'r': (r.x, r.y, r.z, r.w), 's': (s.x, s.y, s.z)}
        except Exception as e:
            pass
    pickle.dump({'gos': gos, 'trs': trs}, open(IDX, 'wb'))
    print('indexed', len(gos), 'objects', len(trs), 'transforms')


def load():
    return pickle.load(open(IDX, 'rb'))


if __name__ == '__main__':
    build()
