const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Content-Type":"application/json"}});
export async function onRequestGet({request}){
  const q=new URL(request.url).searchParams.get("q")?.trim()||"";
  if(!q)return json({error:"Query required."},400);
  try{
    const r=await fetch("https://api.duckduckgo.com/?q="+encodeURIComponent(q)+"&format=json&no_html=1&skip_disambig=1",{headers:{"User-Agent":"GutHeb-Workers/1.0"}});
    if(!r.ok)return json({error:"Search provider error."},502);
    const d=await r.json();
    const results=[];
    if(d.AbstractText)results.push({title:d.Heading||q,url:d.AbstractURL||"",snippet:d.AbstractText});
    for(const x of (d.RelatedTopics||[]).slice(0,8)){
      if(x.Text)results.push({title:x.Text.slice(0,100),url:x.FirstURL||"",snippet:x.Text});
      for(const y of (x.Topics||[]).slice(0,4))if(y.Text)results.push({title:y.Text.slice(0,100),url:y.FirstURL||"",snippet:y.Text});
    }
    return json({query:q,results:results.slice(0,10)});
  }catch(e){return json({error:e.message||"Search failed."},500)}
}
