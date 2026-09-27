const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...headers}});
const db=env=>env.pages||null;
export async function onRequestGet({request,env,params}){
 const pages=db(env);if(!pages)return json({error:"D1 binding 'pages' is not available."},503);
 const id=String(params?.id||new URL(request.url).pathname.split("/").filter(Boolean).pop()||"");if(!id)return json({error:"Deployment ID missing."},400);
 const d=await pages.prepare("SELECT d.*,p.name AS project_name FROM page_deployments d JOIN page_projects p ON p.id=d.project_id WHERE d.id=? AND d.status='published'").bind(id).first();
 if(!d)return json({error:"Published deployment not found."},404);
 const fs=await pages.prepare("SELECT path,content,mime FROM page_files WHERE project_id=? ORDER BY path").bind(d.project_id).all();
 return json({ok:true,id:d.id,project:d.project_name,files:fs.results||[],url:d.url||("/pages/#"+encodeURIComponent(d.id)),metadata:JSON.parse(d.metadata||"{}")});
}
