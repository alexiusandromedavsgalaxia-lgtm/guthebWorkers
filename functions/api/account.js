const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...extra}});
const enc=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha(s){return hex(await crypto.subtle.digest("SHA-256",enc.encode(s)))}
async function passwordHash(password,salt){return sha(salt+":"+password)}
function cookie(name,value,maxAge){return name+"="+value+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+maxAge}
function clearCookie(name){return name+"=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0}
async function userFrom(request,env){
  if(!env.GUTHEB_DB)return null;
  const raw=request.headers.get("Cookie")||"",m=raw.match(/(?:^|; )gutheb_session=([^;]+)/);if(!m)return null;
  const tokenHash=await sha(m[1]);const row=await env.GUTHEB_DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? ").bind(tokenHash,new Date().toISOString()).first();
  return row||null;
}
async function read(request){try{return await request.json()}catch{return {}}}
export async function onRequestPost({request,env}){
  if(!env.GUTHEB_DB)return json({error:"GUTHEB_DB is not bound to this Pages project."},503);
  const b=await read(request),action=String(b.action||"");
  if(action==="register"||action==="login"){
    const email=String(b.email||"").trim().toLowerCase(),password=String(b.password||""),username=String(b.username||email.split("@")[0]||"user").trim();
    if(!email||!password||(action==="register"&&!username))return json({error:"Missing account fields."},400);
    if(action==="register"){
      const exists=await env.GUTHEB_DB.prepare("SELECT id FROM users WHERE email=? OR username=?").bind(email,username).first();
      if(exists)return json({error:"Email or username already exists."},409);
      const id=crypto.randomUUID(),salt=crypto.randomUUID(),hash=await passwordHash(password,salt);
      await env.GUTHEB_DB.batch([
        env.GUTHEB_DB.prepare("INSERT INTO users(id,username,email,password_hash,created_at) VALUES(?,?,?,?,?)").bind(id,username,email,salt+":"+hash,new Date().toISOString()),
        env.GUTHEB_DB.prepare("INSERT INTO profiles(user_id,username) VALUES(?,?)").bind(id,username)
      ]);
    }
    const row=await env.GUTHEB_DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
    if(!row)return json({error:"Invalid email or password."},401);
    const [salt,stored]=String(row.password_hash).split(":");if(await passwordHash(password,salt)!==stored)return json({error:"Invalid email or password."},401);
    const token=crypto.randomUUID()+crypto.randomUUID(),tokenHash=await sha(token),expires=new Date(Date.now()+1000*60*60*24*30).toISOString();
    await env.GUTHEB_DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(tokenHash,row.id,expires).run();
    const p=await env.GUTHEB_DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(row.id).first();
    return new Response(JSON.stringify({user:{id:row.id,name:row.username,email:row.email},profile:p}),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Set-Cookie":cookie("gutheb_session",token,60*60*24*30)}});
  }
  const user=await userFrom(request,env);if(!user)return json({error:"Not authenticated."},401);
  if(action==="me"){
    const p=await env.GUTHEB_DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(user.id).first();
    const repos=await env.GUTHEB_DB.prepare("SELECT * FROM repos WHERE owner_id=? ORDER BY updated_at DESC").bind(user.id).all();
    const out=[];for(const r of repos.results||[]){const fs=await env.GUTHEB_DB.prepare("SELECT path,content FROM repo_files WHERE repo_id=? ORDER BY path").bind(r.id).all();const folders=await env.GUTHEB_DB.prepare("SELECT path FROM repo_folders WHERE repo_id=? ORDER BY path").bind(r.id).all();out.push({...r,owner:user.username,files:Object.fromEntries((fs.results||[]).map(x=>[x.path,x.content])),folders:(folders.results||[]).map(x=>x.path)});}
    return json({user:{id:user.id,name:user.username,email:user.email},profile:p,repos:out});
  }
  if(action==="profile"){
    const p=b.profile||{};const username=String(p.username||user.username).trim();if(!username)return json({error:"Username required."},400);
    const conflict=await env.GUTHEB_DB.prepare("SELECT id FROM users WHERE username=? AND id<>?").bind(username,user.id).first();if(conflict)return json({error:"Username already exists."},409);
    await env.GUTHEB_DB.batch([
      env.GUTHEB_DB.prepare("UPDATE users SET username=? WHERE id=?").bind(username,user.id),
      env.GUTHEB_DB.prepare("INSERT INTO profiles(user_id,username,bio,location,website,avatar) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,bio=excluded.bio,location=excluded.location,website=excluded.website,avatar=excluded.avatar").bind(user.id,username,String(p.bio||""),String(p.location||""),String(p.website||""),String(p.avatar||""))
    ]);
    return json({ok:true});
  }
  if(action==="repo"){
    const r=b.repo||{};const name=String(r.name||"").trim();if(!name)return json({error:"Repository name required."},400);
    const id=r.id||crypto.randomUUID(),now=new Date().toISOString();
    const old=await env.GUTHEB_DB.prepare("SELECT id FROM repos WHERE owner_id=? AND name=?").bind(user.id,name).first();
    if(old&&old.id!==id)return json({error:"Repository already exists."},409);
    await env.GUTHEB_DB.prepare("INSERT INTO repos(id,owner_id,name,description,visibility,language,license,stars,forks,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,visibility=excluded.visibility,language=excluded.language,license=excluded.license,stars=excluded.stars,forks=excluded.forks,updated_at=excluded.updated_at").bind(id,user.id,name,String(r.description||""),String(r.visibility||"Public"),String(r.language||""),String(r.license||"MIT"),Number(r.stars||0),Number(r.forks||0),now).run();
    await env.GUTHEB_DB.prepare("DELETE FROM repo_files WHERE repo_id=?").bind(id).run();await env.GUTHEB_DB.prepare("DELETE FROM repo_folders WHERE repo_id=?").bind(id).run();
    const statements=[];for(const [path,content] of Object.entries(r.files||{}))statements.push(env.GUTHEB_DB.prepare("INSERT INTO repo_files(repo_id,path,content) VALUES(?,?,?)").bind(id,path,String(content??"")));for(const path of r.folders||[])statements.push(env.GUTHEB_DB.prepare("INSERT INTO repo_folders(repo_id,path) VALUES(?,?)").bind(id,path));if(statements.length)await env.GUTHEB_DB.batch(statements);
    return json({ok:true,id});
  }
  if(action==="logout"){
    const raw=request.headers.get("Cookie")||"",m=raw.match(/(?:^|; )gutheb_session=([^;]+)/);if(m)await env.GUTHEB_DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha(m[1])).run();
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Set-Cookie":clearCookie("gutheb_session")}});
  }
  return json({error:"Unknown action."},400);
}
export async function onRequestGet({request,env}){if(!env.GUTHEB_DB)return json({error:"GUTHEB_DB is not bound to this Pages project."},503);const user=await userFrom(request,env);if(!user)return json({error:"Not authenticated."},401);const p=await env.GUTHEB_DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(user.id).first();return json({user:{id:user.id,name:user.username,email:user.email},profile:p});}
export async function onRequestOptions(){return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}})}