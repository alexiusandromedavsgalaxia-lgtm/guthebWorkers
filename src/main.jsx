import React,{useEffect,useMemo,useState}from"react";
import{createRoot}from"react-dom/client";
import"./styles.css";

const starter={
 "index.html":`<!doctype html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GutHeb app</title></head>
<body><main><h1>your new app</h1><p>describe a change in the chat to get started</p></main></body>
</html>`,
 "src/main.js":"document.documentElement.dataset.gutheb='true';"
};

const icon=(name)=><span className="ico" aria-hidden="true">{name}</span>;

function useProject(){
 const[files,setFiles]=useState(()=>{try{return JSON.parse(localStorage.getItem("ghw-files")||"null")||starter}catch{return starter}});
 const[project,setProject]=useState(()=>localStorage.getItem("ghw-project")||"untitled app");
 const[projectId,setProjectId]=useState(()=>localStorage.getItem("ghw-project-id")||null);
 const[account,setAccount]=useState(null);
 const[repos,setRepos]=useState([]);
 const[busy,setBusy]=useState(false);
 useEffect(()=>localStorage.setItem("ghw-files",JSON.stringify(files)),[files]);
 useEffect(()=>localStorage.setItem("ghw-project",project),[project]);
 return{files,setFiles,project,setProject,projectId,setProjectId,account,setAccount,repos,setRepos,busy,setBusy};
}

function App(){
 const path=location.pathname;
 if(path.startsWith("/pages/"))return <PublishedPage/>;
 const state=useProject();
 const[screen,setScreen]=useState(path.startsWith("/builder")?"builder":"home");
 const[auth,setAuth]=useState(path==="/signup"?"register":path==="/reset-password"?"reset":"login");

 useEffect(()=>{
  fetch("/api/account",{credentials:"include"}).then(async r=>r.ok?r.json():null).then(async d=>{
   if(d?.user){
    state.setAccount(d.user);
    const mr=await fetch("/api/account",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"me"})});
    if(mr.ok){const md=await mr.json();state.setRepos(md.repos||[]);}
    setScreen(path.startsWith("/builder")?"builder":"home");
   }
  }).catch(()=>{});
 },[]);

 const navigate=(next)=>{
  setScreen(next);
  const url=next==="builder"?"/builder/"+encodeURIComponent(state.projectId||"new"):"/";
  history.replaceState(null,"",url);
 };
 const loginMode=(m)=>{setAuth(m);history.replaceState(null,"",m==="register"?"/signup":m==="reset"?"/reset-password":"/login");setScreen("auth")};

 if(screen==="auth")return <Auth mode={auth} setMode={loginMode} onDone={(user)=>{state.setAccount(user);setScreen("home");history.replaceState(null,"","/")}}/>;
 if(screen==="home")return <Home account={state.account} repos={state.repos} onNew={()=>navigate("builder")} onOpen={(r)=>{
   state.setProjectId(r.id);state.setProject(r.name);state.setFiles(r.files&&Object.keys(r.files).length?r.files:starter);localStorage.setItem("ghw-project-id",r.id);navigate("builder")
 }} onLogin={()=>loginMode("login")} onSignup={()=>loginMode("register")}/>;
 return <Builder {...state} onHome={()=>navigate("home")} />;
}

function Auth({mode,setMode,onDone}){
 const register=mode==="register",reset=mode==="reset";
 const[form,setForm]=useState({username:"",email:"",password:""});
 const[error,setError]=useState("");
 const submit=async e=>{
  e.preventDefault();setError("");
  if(reset){setError("password reset needs an email provider configured in cloudflare first");return}
  try{
   const r=await fetch("/api/account",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:register?"register":"login",...form})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"could not sign in");onDone(d.user);
  }catch(e){setError(e.message)}
 };
 return <div className="authPage"><div className="authBackdrop"/><main className="authWrap">
   <div className="brand lockup"><img src="/gutheb-workers.svg"/><span>GutHeb</span></div>
   <section className="authCard">
    <div className="miniLabel">GUTHEB WORKERS</div>
    <h1>{reset?"reset your password":register?"create your account":"welcome back"}</h1>
    <p>{reset?"enter your email to receive reset instructions":register?"your projects are saved to your workers account":"sign in to keep building"}</p>
    <form onSubmit={submit}>
     {register&&<input autoFocus required placeholder="username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/>}
     <input autoFocus={!register} required type="email" placeholder="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
     {!reset&&<input required minLength={8} type="password" placeholder="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>}
     {error&&<div className="formError">{error}</div>}
     <button className="solid wide" type="submit">{reset?"send instructions":register?"create account":"log in"}</button>
    </form>
    {!reset&&<button className="textButton" onClick={()=>setMode("reset")}>forgot password?</button>}
    <div className="authSwitch">{reset?"remembered it?":register?"already have an account?":"new here?"} <button onClick={()=>setMode(reset?"login":register?"login":"register")}>{reset?"log in":register?"log in":"sign up"}</button></div>
   </section>
 </main></div>;
}

function Home({account,repos,onNew,onOpen,onLogin,onSignup}){
 return <div className="homePage">
  <header className="homeTop"><div className="brand"><img src="/gutheb-workers.svg"/><span>GutHeb</span></div><div className="homeActions">{account?<span className="accountPill">{account.name||account.username}</span>:<><button onClick={onLogin}>log in</button><button className="solid" onClick={onSignup}>sign up</button></>}</div></header>
  <main className="homeMain">
   <div className="homeIntro"><div className="miniLabel">WORKSPACE</div><h1>what will you build?</h1><p>start with an idea, then shape it in the builder</p></div>
   <div className="projectGrid">
    <button className="newProject" onClick={onNew}><span className="newIcon">＋</span><b>new app</b><small>start from a blank project</small></button>
    {repos.map(r=><button className="projectCard" key={r.id} onClick={()=>onOpen(r)}><div className="projectThumb"><span>✦</span></div><div><b>{r.name}</b><small>{r.description||"gutheb workers project"}</small></div></button>)}
   </div>
  </main>
 </div>;
}

function Builder({files,setFiles,project,setProject,projectId,setProjectId,account,busy,setBusy,onHome}){
 const[mode,setMode]=useState("edit");
 const[device,setDevice]=useState("desktop");
 const[chat,setChat]=useState("");
 const[messages,setMessages]=useState([]);
 const[page,setPage]=useState("index.html");
 const[inspector,setInspector]=useState("pages");
 const[codeOpen,setCodeOpen]=useState(false);
 const[previewKey,setPreviewKey]=useState(0);
 const[status,setStatus]=useState("saved");
 const[mobileOpen,setMobileOpen]=useState(false);
 const[activeFile,setActiveFile]=useState("index.html");

 const html=files["index.html"]||"<h1>no index.html</h1>";
 const fileNames=Object.keys(files).sort();
 const preview=useMemo(()=>injectPreview(html),[html,previewKey]);

 const save=async(nextFiles=files)=>{
  if(!account){setMessages(m=>[...m,{role:"system",text:"sign in first to save this project"}]);return null}
  setBusy(true);setStatus("saving…");
  try{
   const r=await fetch("/api/pages",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"project",project:{id:projectId||undefined,name:project,slug:project,description:"GutHeb Workers project",files:nextFiles}})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"could not save");
   setProjectId(d.id);localStorage.setItem("ghw-project-id",d.id);history.replaceState(null,"","/builder/"+encodeURIComponent(d.id));setStatus("saved");return d.id;
  }catch(e){setStatus("error");setMessages(m=>[...m,{role:"system",text:e.message}]);return null}finally{setBusy(false)}
 };

 const ask=async()=>{
  const q=chat.trim();if(!q)return;setChat("");setMessages(m=>[...m,{role:"user",text:q},{role:"ai",text:"working on your app…"}]);
  try{
   const r=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:q,history:messages.slice(-10),files})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"ai request failed");
   let next={...files},changed=false;
   for(const op of [...(d.operations||[]),...(d.backend_actions||[]).map(x=>({type:"write_file",path:x.path,content:x.content}))]){
    const p=String(op.path||"").replace(/^\/+|^\.\.\//g,"");if(!p||p.includes(".."))continue;
    if(op.type==="write_file"||op.type==="write_backend"){next[p]=String(op.content??"");changed=true;setActiveFile(p)}
    if(op.type==="delete_file"){delete next[p];changed=true}
   }
   if(changed){setFiles(next);await save(next);setPreviewKey(x=>x+1)}
   setMessages(m=>[...m.slice(0,-1),{role:"ai",text:String(d.message||"done")+(changed?"":"") }]);
  }catch(e){setMessages(m=>[...m.slice(0,-1),{role:"ai error",text:e.message}])}
 };

 const deploy=async()=>{
  const id=await save();if(!id)return;
  try{
   const r=await fetch("/api/pages",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"deployment",projectId:id,status:"published",metadata:{source:"gutheb-workers-builder"}})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"deployment failed");
   const url=location.origin+"/pages/"+encodeURIComponent(d.id);
   setMessages(m=>[...m,{role:"system",text:"published → "+url}]);
   window.open(url,"_blank","noopener,noreferrer");
  }catch(e){setMessages(m=>[...m,{role:"system",text:e.message}])}
 };

 const updateFile=(content)=>{setFiles(x=>({...x,[activeFile]:content}));setStatus("unsaved")};

 return <div className="builderShell">
  <header className="builderTop">
   <div className="topLeft"><button className="iconButton" onClick={onHome} title="workspace">{icon("‹")}</button><div className="brand"><img src="/gutheb-workers.svg"/><span>GutHeb</span></div><button className="projectSelect" onClick={()=>{const n=prompt("project name",project);if(n){setProject(n);setStatus("unsaved")}}}>{project}<span>⌄</span></button></div>
   <div className="topCenter">
    <button className={mode==="preview"?"topTab active":"topTab"} onClick={()=>setMode("preview")}>preview</button>
    <button className={mode==="dashboard"?"topTab active":"topTab"} onClick={()=>setMode("dashboard")}>dashboard</button>
    <button className={mode==="edit"?"topTab active":"topTab"} onClick={()=>setMode("edit")}>edit</button>
    <button className={mode==="canvas"?"topTab active":"topTab"} onClick={()=>setMode("canvas")}>canvas</button>
   </div>
   <div className="topRight"><span className="saveState">{status}</span><button className="iconButton" onClick={()=>setCodeOpen(v=>!v)} title="code">{icon("</>")}</button><button className="solid publish" onClick={deploy} disabled={busy}>{busy?"…":"publish"}</button><button className="avatar">{(account?.name||"g").slice(0,1).toUpperCase()}</button></div>
  </header>

  <div className="builderBody">
   <aside className="chatPane">
    <div className="chatHeader"><div><b>{mode==="dashboard"?"dashboard":"gutheb ai"}</b><small>{mode==="dashboard"?"project controls":"describe what you want to change"}</small></div><button className="iconButton" onClick={()=>setMobileOpen(v=>!v)}>⋯</button></div>
    {mode==="dashboard"?<Dashboard project={project} files={files} onSave={()=>save()} onDeploy={deploy}/>:mode==="canvas"?<CanvasHelp/>:<>
      <div className="chatMessages">
       {messages.length===0&&<div className="chatWelcome"><div className="spark">✦</div><h2>what should we build?</h2><p>tell gutheb ai what you want and it will edit the project for you</p><div className="suggestions"><button onClick={()=>setChat("make the landing page feel more polished")}>make it more polished</button><button onClick={()=>setChat("add a responsive navigation")}>add responsive navigation</button><button onClick={()=>setChat("redesign this with a modern editorial style")}>redesign the page</button></div></div>}
       {messages.map((m,i)=><div className={"chatMessage "+m.role} key={i}><span className="messageAvatar">{m.role==="user"?"you":"✦"}</span><div><div className="messageText">{m.text}</div>{m.role==="ai"&&<div className="messageActions"><button>↶</button><button>⋯</button></div>}</div></div>)}
      </div>
      <div className="chatComposer"><div className="composerBox"><textarea value={chat} onChange={e=>setChat(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask()}}} placeholder="describe what you want to build…"/><div className="composerBottom"><button>＋</button><span>enter to send</span><button className="send" onClick={ask}>↑</button></div></div></div>
    </>}
   </aside>

   <main className="previewPane">
    <div className="previewToolbar"><div className="crumb">{icon("⌂")} <span>{project}</span><span>/</span><b>{page}</b></div><div className="deviceTools"><button className={device==="desktop"?"active":""} onClick={()=>setDevice("desktop")}>▱</button><button className={device==="tablet"?"active":""} onClick={()=>setDevice("tablet")}>▯</button><button className={device==="mobile"?"active":""} onClick={()=>setDevice("mobile")}>▯</button><button onClick={()=>setPreviewKey(x=>x+1)}>↻</button></div></div>
    <div className="previewStage">
      {mode==="canvas"?<Canvas preview={preview} device={device}/>:mode==="dashboard"?<Canvas preview={preview} device={device}/>:<div className={"siteFrame "+device}><iframe key={previewKey} title="app preview" sandbox="allow-scripts allow-forms allow-modals allow-popups" srcDoc={preview}/></div>}
    </div>
   </main>

   <aside className="inspectorPane">
    <div className="inspectorTabs"><button className={inspector==="pages"?"active":""} onClick={()=>setInspector("pages")}>pages</button><button className={inspector==="files"?"active":""} onClick={()=>setInspector("files")}>files</button><button className={inspector==="style"?"active":""} onClick={()=>setInspector("style")}>style</button></div>
    {inspector==="pages"&&<Pages files={files} page={page} setPage={setPage}/>}
    {inspector==="files"&&<Files files={files} active={activeFile} setActive={setActiveFile} onAdd={()=>{const p=prompt("file path","src/App.jsx");if(p&&!files[p])setFiles(x=>({...x,[p]:""}))}}/>}
    {inspector==="style"&&<StylePanel/>}
   </aside>
  </div>

  {codeOpen&&<CodeDrawer files={files} active={activeFile} setActive={setActiveFile} value={files[activeFile]||""} onChange={updateFile} onSave={()=>save()}/>}
 </div>;
}

function Pages({files,page,setPage}){
 const pages=[["index.html","home"],...Object.keys(files).filter(x=>x.endsWith(".html")&&x!=="index.html").map(x=>[x,x.replace(".html","")])];
 return <div className="inspectorContent"><div className="panelTitle"><span>pages</span><button>＋</button></div><div className="pageList">{pages.map(([p,label])=><button className={p===page?"pageItem active":"pageItem"} key={p} onClick={()=>setPage(p)}><span>□</span><span>{label}</span><small>{p}</small></button>)}</div><div className="inspectorSection"><b>project</b><div className="kv"><span>files</span><span>{Object.keys(files).length}</span></div><div className="kv"><span>runtime</span><span>web</span></div></div></div>;
}

function Files({files,active,setActive,onAdd}){
 return <div className="inspectorContent"><div className="panelTitle"><span>files</span><button onClick={onAdd}>＋</button></div><div className="fileList">{Object.keys(files).sort().map(p=><button className={p===active?"fileItem active":"fileItem"} key={p} onClick={()=>setActive(p)}>{icon(p.endsWith(".html")?"◇":p.endsWith(".css")?"◈":"◆")}<span>{p}</span></button>)}</div></div>;
}

function StylePanel(){
 return <div className="inspectorContent"><div className="panelTitle"><span>design</span></div><div className="styleMock"><label>theme</label><div className="swatches"><i/><i/><i/><i/></div><label>layout</label><button>responsive</button><button>rounded</button><button>compact</button><label>typography</label><div className="typePreview">Aa <span>Inter / system</span></div></div></div>;
}

function Dashboard({project,files,onSave,onDeploy}){
 return <div className="dashboard"><div className="dashHero"><span className="miniLabel">APP DASHBOARD</span><h2>{project}</h2><p>manage your project, files and publishing</p></div><div className="dashCards"><div><b>{Object.keys(files).length}</b><span>files</span></div><div><b>web</b><span>runtime</span></div><div><b>pages</b><span>storage</span></div></div><button className="dashboardAction" onClick={onSave}>save project</button><button className="dashboardAction" onClick={onDeploy}>publish latest version</button></div>;
}

function CanvasHelp(){return <div className="canvasInfo"><span className="spark">✦</span><h2>canvas</h2><p>use the live preview as your visual workspace. choose a page above, switch device sizes, and keep iterating with ai.</p></div>}
function Canvas({preview,device}){return <div className="canvasBoard"><div className="canvasCard"><div className="canvasCardTop">live page <span>100%</span></div><div className={"siteFrame "+device}><iframe title="canvas preview" sandbox="allow-scripts allow-forms allow-modals allow-popups" srcDoc={preview}/></div></div></div>}

function CodeDrawer({files,active,setActive,value,onChange,onSave}){
 return <div className="codeDrawer"><div className="codeHead"><div className="codeTabs">{Object.keys(files).sort().map(p=><button className={p===active?"active":""} key={p} onClick={()=>setActive(p)}>{p}</button>)}</div><button className="solid small" onClick={onSave}>save</button></div><textarea value={value} onChange={e=>onChange(e.target.value)} spellCheck="false"/></div>;
}

function PublishedPage(){
 const[id]=useState(()=>decodeURIComponent(location.pathname.split("/")[2]||""));
 const[status,setStatus]=useState("loading…"),[html,setHtml]=useState("");
 useEffect(()=>{fetch("/api/deployment/"+encodeURIComponent(id)).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"not found");setHtml((d.files||[]).find(x=>x.path==="index.html")?.content||"");setStatus("")}).catch(e=>setStatus(e.message))},[id]);
 if(status)return <div className="publishedState">{status}</div>;
 return <iframe className="publishedFrame" title="published app" srcDoc={html}/>;
}

function injectPreview(source){
 let html=String(source||"");
 if(!/<html[\s>]/i.test(html))html="<!doctype html><html><head></head><body>"+html+"</body></html>";
 if(!/<meta[^>]+viewport/i.test(html))html=html.replace(/<head>/i,'<head><meta name="viewport" content="width=device-width,initial-scale=1">');
 return html;
}

createRoot(document.getElementById("root")).render(<App/>);
