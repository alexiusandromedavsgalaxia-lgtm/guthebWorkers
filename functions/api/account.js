const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...extra}});
const enc=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha(s){return hex(await crypto.subtle.digest("SHA-256",enc.encode(s)))}
async function passwordHash(password,salt){return sha(salt+":"+password)}
function cookie(name,value,maxAge){return name+"="+value+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+maxAge}
function clearCookie(name){return name+"=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"}
function dbs(env){
  return {
    users:env.USERS_DB||env.users||env.USERS||env.GUTHEB_DB,
    repos:env.REPOS_DB||env.repositories||env.REPOSITORIES||env.GUTHEB_DB,
    archive:env.ARCHIVE_DB||env.archive||env.ARCHIVE||null,
    zip:env.REPOZIP_DB||env.ZIP_DB||env.zip||env.REPOZIP||null
  };
}
async function userFrom(request,env){
  const {users}=dbs(env);if(!users)return null;
  const raw=request.headers.get("Cookie")||"",m=raw.match(/(?:^|; )gutheb_session=([^;]+)/);if(!m)return null;
  const tokenHash=await sha(m[1]);return await users.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(tokenHash,new Date().toISOString()).first();
}
async function read(request){try{return await request.json()}catch{return {}}}
async function ensureSchemas(env){
  const {users,repos}=dbs(env);
  if(!users||!repos)throw new Error("USERS_DB and REPOS_DB must be bound.");
  await users.batch([
    users.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL)"),
    users.prepare("CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY,username TEXT NOT NULL,bio TEXT NOT NULL DEFAULT '',location TEXT NOT NULL DEFAULT '',website TEXT NOT NULL DEFAULT '',avatar TEXT NOT NULL DEFAULT '')"),
    users.prepare("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL)")
  ]);
  await repos.batch([
    repos.prepare("CREATE TABLE IF NOT EXISTS repos (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',visibility TEXT NOT NULL DEFAULT 'Public',language TEXT NOT NULL DEFAULT '',license TEXT NOT NULL DEFAULT 'MIT',stars INTEGER NOT NULL DEFAULT 0,forks INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)"),
    repos.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_repos_owner_name ON repos(owner_id,name)"),
    repos.prepare("CREATE TABLE IF NOT EXISTS repo_files (repo_id TEXT NOT NULL,path TEXT NOT NULL,content TEXT NOT NULL DEFAULT '',PRIMARY KEY(repo_id,path))"),
    repos.prepare("CREATE TABLE IF NOT EXISTS repo_folders (repo_id TEXT NOT NULL,path TEXT NOT NULL,PRIMARY KEY(repo_id,path))")
  ]);
}

export async function onRequestPost({request,env}){
  const {users,repos,archive,zip}=dbs(env);
  if(!users||!repos)return json({error:"USERS_DB and REPOS_DB must be bound to this Pages project."},503);
  try{await ensureSchemas(env)}catch(e){return json({error:"D1 schema initialization failed: "+e.message},503)}
  const b=await read(request),action=String(b.action||"");
  if(action==="register"||action==="login"){
    const email=String(b.email||"").trim().toLowerCase(),password=String(b.password||""),username=String(b.username||email.split("@")[0]||"user").trim();
    if(!email||!password||(action==="register"&&!username))return json({error:"Missing account fields."},400);
    if(action==="register"){
      const exists=await users.prepare("SELECT id FROM users WHERE email=? OR username=?").bind(email,username).first();
      if(exists)return json({error:"Email or username already exists."},409);
      const id=crypto.randomUUID(),salt=crypto.randomUUID(),hash=await passwordHash(password,salt);
      await users.batch([
        users.prepare("INSERT INTO users(id,username,email,password_hash,created_at) VALUES(?,?,?,?,?)").bind(id,username,email,salt+":"+hash,new Date().toISOString()),
        users.prepare("INSERT INTO profiles(user_id,username) VALUES(?,?)").bind(id,username)
      ]);
    }
    const row=await users.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
    if(!row)return json({error:"Invalid email or password."},401);
    const [salt,stored]=String(row.password_hash).split(":");if(!salt||await passwordHash(password,salt)!==stored)return json({error:"Invalid email or password."},401);
    const token=crypto.randomUUID()+crypto.randomUUID(),tokenHash=await sha(token),expires=new Date(Date.now()+1000*60*60*24*30).toISOString();
    await users.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(tokenHash,row.id,expires).run();
    const p=await users.prepare("SELECT * FROM profiles WHERE user_id=?").bind(row.id).first();
    const owned=await repos.prepare("SELECT * FROM repos WHERE owner_id=? ORDER BY updated_at DESC").bind(row.id).all();
    return new Response(JSON.stringify({user:{id:row.id,name:row.username,email:row.email},profile:p,repos:owned.results||[],storage:{users:"users",repos:"repos",archive:!!archive,zip:!!zip}}),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Set-Cookie":cookie("gutheb_session",token,60*60*24*30)}});
  }
  const user=await userFrom(request,env);if(!user)return json({error:"Not authenticated."},401);
  if(action==="me"){
    const p=await users.prepare("SELECT * FROM profiles WHERE user_id=?").bind(user.id).first();
    const rs=await repos.prepare("SELECT * FROM repos WHERE owner_id=? ORDER BY updated_at DESC").bind(user.id).all();
    const out=[];for(const r of rs.results||[]){const fs=await repos.prepare("SELECT path,content FROM repo_files WHERE repo_id=? ORDER BY path").bind(r.id).all();const folders=await repos.prepare("SELECT path FROM repo_folders WHERE repo_id=? ORDER BY path").bind(r.id).all();out.push({...r,owner:user.username,files:Object.fromEntries((fs.results||[]).map(x=>[x.path,x.content])),folders:(folders.results||[]).map(x=>x.path)});}
    return json({user:{id:user.id,name:user.username,email:user.email},profile:p,repos:out,storage:{users:"users",repos:"repos",archive:!!archive,zip:!!zip}});
  }
  if(action==="profile"){
    const p=b.profile||{},username=String(p.username||user.username).trim();if(!username)return json({error:"Username required."},400);
    const conflict=await users.prepare("SELECT id FROM users WHERE username=? AND id<>?").bind(username,user.id).first();if(conflict)return json({error:"Username already exists."},409);
    await users.batch([
      users.prepare("UPDATE users SET username=? WHERE id=?").bind(username,user.id),
      users.prepare("INSERT INTO profiles(user_id,username,bio,location,website,avatar) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,bio=excluded.bio,location=excluded.location,website=excluded.website,avatar=excluded.avatar").bind(user.id,username,String(p.bio||""),String(p.location||""),String(p.website||""),String(p.avatar||""))
    ]);
    return json({ok:true});
  }
  if(action==="repo"){
    const r=b.repo||{},name=String(r.name||"").trim();if(!name)return json({error:"Repository name required."},400);
    let id=String(r.id||"").trim();
    if(id){
      const owned=await repos.prepare("SELECT id FROM repos WHERE id=? AND owner_id=?").bind(id,user.id).first();
      if(!owned)return json({error:"Repository does not belong to this account."},403);
    }else{
      const existing=await repos.prepare("SELECT id FROM repos WHERE owner_id=? AND name=?").bind(user.id,name).first();
      if(existing)return json({error:"Repository already exists.","id":existing.id},409);
      id=crypto.randomUUID();
    }
    const now=new Date().toISOString();
    await repos.prepare("INSERT INTO repos(id,owner_id,name,description,visibility,language,license,stars,forks,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,visibility=excluded.visibility,language=excluded.language,license=excluded.license,stars=excluded.stars,forks=excluded.forks,updated_at=excluded.updated_at").bind(id,user.id,name,String(r.description||""),String(r.visibility||"Public"),String(r.language||""),String(r.license||"MIT"),Number(r.stars||0),Number(r.forks||0),now).run();
    await repos.prepare("DELETE FROM repo_files WHERE repo_id=?").bind(id).run();await repos.prepare("DELETE FROM repo_folders WHERE repo_id=?").bind(id).run();
    const statements=[];for(const [path,content] of Object.entries(r.files||{}))statements.push(repos.prepare("INSERT INTO repo_files(repo_id,path,content) VALUES(?,?,?)").bind(id,path,String(content??"")));for(const path of r.folders||[])statements.push(repos.prepare("INSERT INTO repo_folders(repo_id,path) VALUES(?,?)").bind(id,path));if(statements.length)await repos.batch(statements);
    return json({ok:true,id});
  }
  if(action==="archive"){
    if(!archive)return json({error:"ARCHIVE_DB is not bound."},503);
    const payload=String(b.content??"");return json({ok:true,available:true,bytes:payload.length});
  }
  if(action==="zip"){
    if(!zip)return json({error:"REPOZIP_DB is not bound."},503);
    return json({ok:true,available:true});
  }
  if(action==="logout"){
    const raw=request.headers.get("Cookie")||"",m=raw.match(/(?:^|; )gutheb_session=([^;]+)/);if(m)await users.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha(m[1])).run();
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Set-Cookie":clearCookie("gutheb_session")}});
  }
  return json({error:"Unknown action."},400);
}
export async function onRequestGet({request,env}){
  const {users}=dbs(env);if(!users)return json({error:"USERS_DB must be bound to this Pages project."},503);
  try{await ensureSchemas(env)}catch(e){return json({error:"D1 schema initialization failed: "+e.message},503)}
  const user=await userFrom(request,env);if(!user)return json({error:"Not authenticated."},401);
  const p=await users.prepare("SELECT * FROM profiles WHERE user_id=?").bind(user.id).first();return json({user:{id:user.id,name:user.username,email:user.email},profile:p});
}
export async function onRequestOptions(){return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}})}
