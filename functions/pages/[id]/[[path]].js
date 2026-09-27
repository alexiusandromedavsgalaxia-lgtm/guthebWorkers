const db=env=>env.pages||null;
function safe(s){const p=String(s||"").split("/").filter(Boolean);if(p.some(x=>x==="."||x===".."))return null;return p.join("/")}
function mime(p){const x=String(p||"").toLowerCase();if(x.endsWith(".css"))return"text/css; charset=utf-8";if(x.endsWith(".js")||x.endsWith(".mjs"))return"text/javascript; charset=utf-8";if(x.endsWith(".json"))return"application/json; charset=utf-8";if(x.endsWith(".svg"))return"image/svg+xml";if(x.endsWith(".png"))return"image/png";if(x.endsWith(".jpg")||x.endsWith(".jpeg"))return"image/jpeg";if(x.endsWith(".webp"))return"image/webp";if(x.endsWith(".html"))return"text/html; charset=utf-8";return"application/octet-stream"}
export async function onRequestGet({env,params}){
const pages=db(env);if(!pages)return new Response("GutHeb Pages is not configured.",{status:503});
const id=String(params?.id||"");const raw=Array.isArray(params?.path)?params.path.join("/"):String(params?.path||"");const path=safe(raw);if(!id||!path)return new Response("Asset not found.",{status:404});
const d=await pages.prepare("SELECT project_id FROM page_deployments WHERE id=? AND status='published'").bind(id).first();if(!d)return new Response("Published deployment not found.",{status:404});
const f=await pages.prepare("SELECT path,content,mime FROM page_files WHERE project_id=? AND path=?").bind(d.project_id,path).first();if(!f)return new Response("Asset not found.",{status:404});
return new Response(f.content||"",{headers:{"Content-Type":f.mime||mime(path),"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}