const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const db=env=>env.WORKERS_PAGES_DB||env.workersPages||env.WORKERS_PAGES||null;
const enc=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha(s){return hex(await crypto.subtle.digest("SHA-256",enc.encode(s)))}
async function userFrom(request,env){
  const users=env.USERS_DB||env.users||env.USERS;if(!users)return null;
  const raw=request.headers.get("Cookie")||"",m=raw.match(/(?:^|; )gutheb_session=([^;]+)/);if(!m)return null;
  const tokenHash=await sha(m[1]);
  return users.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(tokenHash,new Date().toISOString()).first();
}
async function read(request){try{return await request.json()}catch{return {}}}
const slug=s=>String(s||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80)||"site";
async function ensurePagesSchema(pages){
  await pages.batch([
    pages.prepare("CREATE TABLE IF NOT EXISTS page_projects (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL,slug TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)"),
    pages.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_page_projects_owner_slug ON page_projects(owner_id,slug)"),
    pages.prepare("CREATE TABLE IF NOT EXISTS page_files (project_id TEXT NOT NULL,path TEXT NOT NULL,content TEXT NOT NULL DEFAULT '',mime TEXT NOT NULL DEFAULT 'text/plain',updated_at TEXT NOT NULL,PRIMARY KEY(project_id,path))"),
    pages.prepare("CREATE TABLE IF NOT EXISTS compilation_logos (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,filename TEXT NOT NULL,mime TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL)"),
    pages.prepare("CREATE TABLE IF NOT EXISTS page_deployments (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',url TEXT NOT NULL DEFAULT '',metadata TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL)")
  ]);
}
export async function onRequestPost({request,env}){
  const pages=db(env);if(!pages)return json({error:"WORKERS_PAGES_DB is not bound."},503);
  try{await ensurePagesSchema(pages)}catch(e){return json({error:"workers-pages schema initialization failed: "+e.message},503)}
  const user=await userFrom(request,env);if(!user)return json({error:"Not authenticated."},401);
  const b=await read(request),action=String(b.action||"");
  if(action==="project"){
    const p=b.project||{},id=String(p.id||crypto.randomUUID()),name=String(p.name||"Untitled site").trim().slice(0,120),s=slug(p.slug||name),now=new Date().toISOString();
    const owned=id!==(String(p.id||""))||await pages.prepare("SELECT id FROM page_projects WHERE id=? AND owner_id=?").bind(id,user.id).first();
    if(p.id&&!owned)return json({error:"Project does not belong to this account."},403);
    await pages.prepare("INSERT INTO page_projects(id,owner_id,name,slug,description,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,description=excluded.description,updated_at=excluded.updated_at").bind(id,user.id,name,s,String(p.description||""),now,now).run();
    if(p.files&&typeof p.files==="object"){
      await pages.prepare("DELETE FROM page_files WHERE project_id=?").bind(id).run();
      const statements=Object.entries(p.files).map(([path,content])=>pages.prepare("INSERT INTO page_files(project_id,path,content,mime,updated_at) VALUES(?,?,?,?,?)").bind(id,String(path),String(content??""),path.endsWith(".html")?"text/html":path.endsWith(".css")?"text/css":path.endsWith(".js")?"text/javascript":"text/plain",now));
      if(statements.length)await pages.batch(statements);
    }
    return json({ok:true,id,slug:s});
  }
  if(action==="logo"){
    const projectId=String(b.projectId||"");const own=await pages.prepare("SELECT id FROM page_projects WHERE id=? AND owner_id=?").bind(projectId,user.id).first();if(!own)return json({error:"Project not found."},404);
    const data=String(b.data||"");if(!data||data.length>700000)return json({error:"Compilation logo is missing or too large."},400);
    const id=crypto.randomUUID();await pages.prepare("INSERT INTO compilation_logos(id,project_id,filename,mime,data,created_at) VALUES(?,?,?,?,?,?)").bind(id,projectId,String(b.filename||"build-logo"),String(b.mime||"image/svg+xml"),data,new Date().toISOString()).run();
    return json({ok:true,id});
  }
  if(action==="deployment"){
    const projectId=String(b.projectId||"");const own=await pages.prepare("SELECT id FROM page_projects WHERE id=? AND owner_id=?").bind(projectId,user.id).first();if(!own)return json({error:"Project not found."},404);
    const id=crypto.randomUUID();const status=String(b.status||"published");const url="/pages/#"+encodeURIComponent(id);await pages.prepare("INSERT INTO page_deployments(id,project_id,status,url,metadata,created_at) VALUES(?,?,?,?,?,?)").bind(id,projectId,status,url,JSON.stringify(b.metadata||{}),new Date().toISOString()).run();
    return json({ok:true,id});
  }
  return json({error:"Unknown action."},400);
}
export async function onRequestGet({request,env}){
  const pages=db(env);if(!pages)return json({error:"WORKERS_PAGES_DB is not bound."},503);
  const user=await userFrom(request,env);if(!user)return json({error:"Not authenticated."},401);
  const projectId=new URL(request.url).searchParams.get("project");
  if(projectId){
    const p=await pages.prepare("SELECT * FROM page_projects WHERE id=? AND owner_id=?").bind(projectId,user.id).first();if(!p)return json({error:"Project not found."},404);
    const fs=await pages.prepare("SELECT path,content,mime,updated_at FROM page_files WHERE project_id=? ORDER BY path").bind(projectId).all();
    const logos=await pages.prepare("SELECT id,filename,mime,data,created_at FROM compilation_logos WHERE project_id=? ORDER BY created_at DESC").bind(projectId).all();
    const deployments=await pages.prepare("SELECT * FROM page_deployments WHERE project_id=? ORDER BY created_at DESC").bind(projectId).all();
    return json({project:p,files:fs.results||[],logos:logos.results||[],deployments:deployments.results||[]});
  }
  const ps=await pages.prepare("SELECT * FROM page_projects WHERE owner_id=? ORDER BY updated_at DESC").bind(user.id).all();return json({projects:ps.results||[]});
}
export async function onRequestOptions(){return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}})}
