import re, os, json
import os.path as _p
base=_p.abspath(_p.join(_p.dirname(_p.abspath(__file__)), '..', '..', 'src'))
app=open(base+'/app.js').read()
# map var -> require path
req={m.group(1):m.group(2) for m in re.finditer(r"const (\w+) = require\('(\./modules/[^']+)'\)", app)}
mounts=[]
for m in re.finditer(r"app\.use\('(/api[^']*)', (\w+)(?:\.(\w+))?\)", app):
    mounts.append((m.group(1), m.group(2), m.group(3)))
rutas=[]
def parse_file(path, prefix, export=None, visited=None):
    visited = visited or set()
    if path in visited or not os.path.exists(path): return
    visited.add(path)
    s=open(path).read()
    d=os.path.dirname(path)
    # which router var corresponds to export
    for m in re.finditer(r"(\w+)\.(get|post|put|patch|delete)\(\s*'([^']*)'\s*,([^\n]*)", s):
        var, met, p, resto = m.groups()
        if export and var not in export: continue
        perm=re.findall(r"requirePermiso\(([^)]*)\)", resto)
        rutas.append({'m':met.upper(),'ruta':prefix+p if p!='/' else prefix,'perm':perm,'archivo':path.replace(base,''),'var':var})
    for m in re.finditer(r"(\w+)\.use\(\s*'([^']*)'\s*,\s*crearRecurso\(\{(.*?)\n\}\)\)", s, re.S):
        var,p,body=m.groups()
        if export and var not in export: continue
        pm=re.search(r"permisos:\s*\{([^}]*)\}", body)
        borr=re.search(r"borrado:\s*([^,\n]+)", body)
        pre=prefix+(p if p!='/' else '')
        for met,pp in [('GET',''),('GET','/:id'),('POST',''),('PUT','/:id')]+([('DELETE','/:id')] if not (borr and borr.group(1).strip()=='false') else []):
            rutas.append({'m':met,'ruta':pre+pp,'perm':[pm.group(1) if pm else '?'],'archivo':path.replace(base,'')+' (crearRecurso)','var':var})
    for m in re.finditer(r"(\w+)\.use\(\s*'([^']*)'\s*,\s*require\('([^']+)'\)(?:\.(\w+))?\)", s):
        var,p,rq,ex=m.groups()
        if export and var not in export: continue
        f=os.path.normpath(os.path.join(d,rq))+('.js' if not rq.endswith('.js') else '')
        parse_file(f, prefix+(p if p!='/' else ''), None, visited)
for mp,var,ex in mounts:
    rp=req.get(var)
    if not rp:
        continue
    f=os.path.normpath(os.path.join(base,rp))
    f = f+'.js' if os.path.exists(f+'.js') else f
    exp=None
    if ex:
        # find variable name exported as ex
        s=open(f).read()
        mm=re.search(r"module\.exports\s*=\s*\{([^}]*)\}", s)
        exp=set()
        for part in mm.group(1).split(','):
            part=part.strip()
            if ':' in part:
                k,v=[x.strip() for x in part.split(':')]
                if k==ex: exp.add(v)
            elif part==ex: exp.add(part)
    parse_file(f, mp, exp)
print(len(rutas))
json.dump(rutas, open(_p.join(_p.dirname(_p.abspath(__file__)), 'rutas.json'),'w'), ensure_ascii=False, indent=0)
sinperm=[r for r in rutas if not r['perm']]
print('sin requirePermiso en la línea:', len(sinperm))
for r in sinperm: print(r['m'], r['ruta'], r['archivo'])
