const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Content-Type":"application/json"}});
function extract(text){
  const raw=String(text||"").trim().replace(/^```json\s*/,"").replace(/^```\s*/,"").replace(/\s*```$/,"");
  try{return JSON.parse(raw)}catch{return {message:raw,operations:[]}}
}
export async function onRequestPost({request,env}){
  try{
    const body=await request.json();
    const message=typeof body?.message==="string"?body.message.trim():"";
    const history=Array.isArray(body?.history)?body.history.slice(-12):[];
    const files=body?.files&&typeof body.files==="object"?body.files:{};
    if(!message)return json({error:"Message is required."},400);
    if(!env.POLLINATIONS_API_KEY)return json({error:"POLLINATIONS_API_KEY is not configured.",provider:"pollinations"},503);
    const fileList=Object.entries(files).map(([path,content])=>"FILE: "+path+"\n"+String(content).slice(0,24000)).join("\n\n");
    const messages=[
      {role:"system",content:"You are GutHeb AI, an autonomous coding agent inside GutHeb Workers. Work on the actual project files. Return ONLY valid JSON, no markdown. Schema: {message:string,operations:[{type:'write_file'|'delete_file'|'create_folder',path:string,content?:string}],tests:[{type:'html'|'js'|'css',path:string}],backend_actions:[{type:'write_backend',path:string,content:string}],search_queries:string[]}. Modify files to satisfy the request. UI changes must be made in real files. Backend actions are represented by writing real functions/api/*.js files. Never claim an operation was executed. Preserve unrelated code. Paths are relative to project root."},
      ...history.map(x=>({role:x.role==="user"?"user":"assistant",content:String(x.text||"")})),
      {role:"user",content:"REQUEST:\n"+message+"\n\nCURRENT PROJECT FILES:\n"+(fileList||"(empty)")}
    ];
    const upstream=await fetch("https://gen.pollinations.ai/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+env.POLLINATIONS_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:env.POLLINATIONS_MODEL||"openai/gpt-5.4-nano",messages,temperature:0.1})});
    if(!upstream.ok)return json({error:"Pollinations provider error.",detail:(await upstream.text()).slice(0,500)},502);
    const data=await upstream.json();
    const output=data?.choices?.[0]?.message?.content||"";
    const plan=extract(output);
    return json({provider:"pollinations",message:String(plan.message||"Listo."),operations:Array.isArray(plan.operations)?plan.operations:[],tests:Array.isArray(plan.tests)?plan.tests:[],backend_actions:Array.isArray(plan.backend_actions)?plan.backend_actions:[],search_queries:Array.isArray(plan.search_queries)?plan.search_queries:[]});
  }catch(e){return json({error:e.message||"Invalid AI request."},400)}
}
export async function onRequestOptions(){return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST, OPTIONS"}})}