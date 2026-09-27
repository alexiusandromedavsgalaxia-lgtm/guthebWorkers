const db=env=>env.pages||null;
function mime(p){const x=String(p||"").toLowerCase();if(x.endsWith(".html"))return"text/html; charset=utf-8";if(x.endsWith(".css"))return"text/css; charset=utf-8";if(x.endsWith(".js")||x.endsWith(".mjs"))return"text/javascript; charset=utf-8";if(x.endsWith(".json"))return"application/json; charset=utf-8";if(x.endsWith(".svg"))return"image/svg+xml";if(x.endsWith(".png"))return"image/png";if(x.endsWith(".jpg")||x.endsWith(".jpeg"))return"image/jpeg";if(x.endsWith(".webp"))return"image/webp";return"application/octet-stream"}
function safe(s){const p=String(s||"").split("/").filter(Boolean);if(p.some(x=>x==="."||x===".."))return null;return p.join("/")}
export async function onRequestGet({env,params}){
const pages=db(env);if(!pages)return new Response("GutHeb Pages is not configured.",{status:503});
const id=String(params?.id||"");if(!id)return new Response("Deployment ID missing.",{status:400});
const d=await pages.prepare("SELECT d.*,p.name AS project_name FROM page_deployments d JOIN page_projects p ON p.id=d.project_id WHERE d.id=? AND d.status='published'").bind(id).first();
if(!d)return new Response("Published deployment not found.",{status:404});
const index=await pages.prepare("SELECT path,content,mime FROM page_files WHERE project_id=? AND path='index.html'").bind(d.project_id).first();
if(!index)return new Response("This deployment has no index.html.",{status:404});
const base="/pages/"+encodeURIComponent(id)+"/";
let html=String(index.content||"");
html=html.replace("<head>","<head><base href=\""+base+"\">");
return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}