"""q.py find NAME...   -> every object with that name and its path
   q.py tree NAME [depth] -> subtree(s) under objects with that name, with local position / euler / scale"""
import math, sys
from uni import load
I = load(); gos, trs = I['gos'], I['trs']
tr_of_go = {(k[0], t['go']): k for k, t in trs.items()}


def name(k):
    return gos.get((k[0], trs[k]['go']), {}).get('name', '?')


def path(k):
    out = []
    while k in trs:
        out.append(name(k)); f = trs[k]['father']
        if not f: break
        k = (k[0], f)
    return '/'.join(reversed(out))


def euler(q):
    x, y, z, w = q
    ex = math.degrees(math.asin(max(-1, min(1, 2 * (w * x - y * z)))))
    ey = math.degrees(math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y)))
    ez = math.degrees(math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z)))
    return tuple(round(v, 2) for v in (ex, ey, ez))


def show(k, depth, ind=0):
    t = trs[k]; g = gos.get((k[0], t['go']), {})
    print('  ' * ind + f"{g.get('name')}{'' if g.get('active', True) else ' (off)'}  p={tuple(round(v, 4) for v in t['p'])} e={euler(t['r'])} s={tuple(round(v, 3) for v in t['s'])}")
    if depth > 0:
        for c in t['kids']:
            if (k[0], c) in trs: show((k[0], c), depth - 1, ind + 1)


cmd, args = sys.argv[1], sys.argv[2:]
if cmd == 'find':
    for k, g in gos.items():
        if any(a.lower() in g['name'].lower() for a in args) and tr_of_go.get(k):
            print(k[0], '|', path(tr_of_go[k]))
else:
    depth = int(args[1]) if len(args) > 1 else 2
    for k, g in gos.items():
        if g['name'] == args[0] and tr_of_go.get(k):
            print('==', k[0], path(tr_of_go[k])); show(tr_of_go[k], depth)
