(()=>{
'use strict';
/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const CAP=window.Capacitor||{};const PL=n=>CAP.Plugins&&CAP.Plugins[n];
const API='https://api.github.com';
const LIM={warn:25*1048576,hard:100*1048576};
const store={get:(k,d)=>{try{const v=localStorage.getItem('rg_'+k);return v==null?d:JSON.parse(v)}catch{return d}},set:(k,v)=>{try{localStorage.setItem('rg_'+k,JSON.stringify(v))}catch{}}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtB=n=>{if(!n)return '0 B';const u=['B','KB','MB','GB'];const i=Math.min(3,Math.floor(Math.log(n)/Math.log(1024)));return (n/1024**i).toFixed(i?1:0)+' '+u[i]};
const fmtT=s=>!isFinite(s)||s<0?'–':s<60?Math.ceil(s)+'s':s<3600?Math.floor(s/60)+'m '+Math.ceil(s%60)+'s':Math.floor(s/3600)+'h '+Math.floor(s%3600/60)+'m';
const ago=t=>{const s=(Date.now()-t)/1000;return s<60?'just now':s<3600?Math.floor(s/60)+'m ago':s<86400?Math.floor(s/3600)+'h ago':new Date(t).toLocaleDateString()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const encPath=p=>p.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const IC={home:'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',repo:'M5 4h13a1 1 0 0 1 1 1v14H7a2 2 0 0 0-2 2V4zM5 18h14',queue:'M4 6h16M4 12h16M4 18h10',hist:'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',set:'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',up:'M12 16V4M6 10l6-6 6 6M5 20h14',folder:'M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',file:'M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5',branch:'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 6-12 3-12 6',plus:'M12 5v14M5 12h14',back:'M15 5l-7 7 7 7',check:'M5 12l5 5 9-10',x:'M6 6l12 12M18 6L6 18',retry:'M4 12a8 8 0 1 1 3 6.2M4 19v-5h5',link:'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',lock:'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',trash:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',pkg:'M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10'};
const ic=(n,s)=>`<svg viewBox="0 0 24 24"${s?` style="width:${s}px;height:${s}px"`:''}><path d="${IC[n]}"/></svg>`;
let toastT;const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),3200)};

/* ---------- secure token storage (Android Keystore via native plugin) ---------- */
const secure={
 async set(k,v){const p=PL('RoohuNative');if(p)await p.secureSet({key:k,value:v});else localStorage.setItem('rgs_'+k,v)},
 async get(k){const p=PL('RoohuNative');if(p){try{return (await p.secureGet({key:k})).value||null}catch{return null}}return localStorage.getItem('rgs_'+k)},
 async del(k){const p=PL('RoohuNative');if(p)await p.secureRemove({key:k});else localStorage.removeItem('rgs_'+k)}
};

/* ---------- state ---------- */
const S={tok:null,user:null,scopes:[],clientId:store.get('cid',''),view:'boot',nav:'home',obi:0,
 settings:Object.assign({naming:'sanitize',apkStamp:true,apkFolder:false,conflict:'ask',concurrency:1,msg:'Upload {name} via Roohu'},store.get('settings',{})),
 queue:store.get('queue',[]).map(i=>['done','failed','skipped','cancelled','conflict'].includes(i.state)?i:Object.assign(i,{state:'failed',lost:true,err:'The app was closed before this upload finished. Add the file again to retry.'})),
 history:store.get('history',[]),dest:store.get('dest',null),repos:null,repoQ:'',br:null,form:{},pick:[],notif:false,rate:null,dev:null,hf:'all'};

/* ---------- GitHub API ---------- */
class GhErr extends Error{constructor(status,data,res){super(explain(status,data));this.status=status;this.data=data}}
function explain(st,d){const m=(d&&d.message)||'';
 if(st===0)return 'Network error. Check your connection and retry.';
 if(st===401)return 'GitHub rejected the saved login. Reconnect your account in Settings.';
 if(st===403||st===429){if(/rate limit|abuse|secondary/i.test(m))return 'GitHub rate limit reached. Wait a minute, then retry. Keep parallel uploads at 1.';
  if(/protect|rule/i.test(m))return 'This branch is protected and does not allow direct pushes. Pick another branch.';
  return 'You do not have write access here, or the token lacks permission. '+(m&&m.slice(0,120));}
 if(st===404)return 'Repository, branch or folder not found, or this login cannot see it. Private repos need the "repo" permission.';
 if(st===409)return 'The branch changed while uploading (another commit landed). Retry. Parallel uploads to one branch cause this.';
 if(st===413)return 'GitHub refused this file as too large. The Contents API allows up to 100 MB; larger files need Git LFS or a Release asset.';
 if(st===422)return m?('GitHub rejected the request: '+m.replace(/\s+/g,' ').slice(0,160)):'GitHub rejected the request.';
 if(st>=500)return 'GitHub is having trouble right now. Retry in a moment.';
 return m||('Unexpected error ('+st+')');}
async function gh(path,o={}){let r;
 try{r=await fetch(path.startsWith('http')?path:API+path,{method:o.method||'GET',headers:Object.assign({Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+S.tok},o.body?{'Content-Type':'application/json'}:{}),body:o.body?JSON.stringify(o.body):undefined})}catch{throw new GhErr(0)}
 const data=r.status===204?null:await r.json().catch(()=>null);
 if(r.status===401&&o.auth!==false)signOut(true);
 if(!r.ok)throw new GhErr(r.status,data);return {data,res:r}}
async function cpost(url,data){const H=PL('CapacitorHttp');const hd={Accept:'application/json','Content-Type':'application/json'};
 if(H){const r=await H.post({url,headers:hd,data});return typeof r.data==='string'?JSON.parse(r.data):r.data}
 const r=await fetch(url,{method:'POST',headers:hd,body:JSON.stringify(data)});return r.json()}

/* ---------- auth: GitHub device flow in the system browser ---------- */
async function startConnect(scope){
 const cid=(S.clientId||'').trim();if(!cid)return toast('Paste your OAuth Client ID first');
 store.set('cid',cid);S.clientId=cid;
 try{const r=await cpost('https://github.com/login/device/code',{client_id:cid,scope});
  if(!r.device_code)return toast(r.error_description||'GitHub did not return a code. Check the Client ID and that Device Flow is enabled.');
  const d=S.dev={code:r.user_code,dc:r.device_code,uri:r.verification_uri,interval:r.interval||5,exp:Date.now()+r.expires_in*1000,msg:'Waiting for you to approve on GitHub…'};
  render();openUri(d.uri);poll(d)}catch(e){toast('Could not reach GitHub. '+(e.message||''))}}
async function openUri(u){const B=PL('Browser');if(B)B.open({url:u});else window.open(u,'_blank')}
async function poll(d){
 while(S.dev===d){await sleep(d.interval*1000);if(S.dev!==d)return;
  if(Date.now()>d.exp){S.dev=null;toast('The code expired. Start again.');return render()}
  let r;try{r=await cpost('https://github.com/login/oauth/access_token',{client_id:S.clientId,device_code:d.dc,grant_type:'urn:ietf:params:oauth:grant-type:device_code'})}catch{continue}
  if(r.access_token){S.dev=null;S.tok=r.access_token;await secure.set('tok',S.tok);try{PL('Browser')?.close()}catch{}
   try{await loadUser();toast('Connected as @'+S.user.login);go('home')}catch{toast('Connected, but loading your profile failed.');go('home')}return}
  if(r.error==='slow_down')d.interval+=5;
  else if(r.error==='expired_token'){S.dev=null;toast('The code expired. Start again.');return render()}
  else if(r.error==='access_denied'){S.dev=null;toast('Authorization was cancelled on GitHub.');return render()}
  else if(r.error&&r.error!=='authorization_pending'){S.dev=null;toast(r.error_description||r.error);return render()}}}
async function loadUser(){const {data,res}=await gh('/user');S.user=data;S.scopes=(res.headers.get('x-oauth-scopes')||'').split(',').map(s=>s.trim()).filter(Boolean)}
async function signOut(expired){S.tok=null;S.user=null;S.scopes=[];S.repos=null;S.br=null;await secure.del('tok');
 if(expired===true)toast('Session ended. Please reconnect.');go('connect')}
async function refreshPerm(){const p=PL('RoohuNative');if(p){try{S.notif=(await p.notifStatus()).enabled}catch{}}
 if(S.tok){try{const {data}=await gh('/rate_limit');S.rate=data.resources.core}catch{}}if(S.view==='settings'||S.view==='connect')render()}

/* ---------- repositories ---------- */
async function loadRepos(){S.repos=[];S.reposLoading=true;render();
 try{for(let p=1;p<=6;p++){const {data}=await gh(`/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member&page=${p}`);S.repos.push(...data);if(data.length<100)break}}
 catch(e){toast(e.message)}S.reposLoading=false;render()}
function openRepo(full){const r=(S.repos||[]).find(x=>x.full_name===full)||{full_name:full,default_branch:'main',permissions:{push:true}};
 S.br={repo:full,meta:r,branch:r.default_branch,path:'',items:[],loading:true};go('browse');loadDir()}
async function loadDir(){const b=S.br;b.loading=true;b.err=null;b.empty=false;render();
 try{const {data}=await gh(`/repos/${b.repo}/contents/${encPath(b.path)}?ref=${encodeURIComponent(b.branch)}`);
  b.items=(Array.isArray(data)?data:[]).sort((a,c)=>(a.type==='dir'?0:1)-(c.type==='dir'?0:1)||a.name.localeCompare(c.name))}
 catch(e){b.items=[];if(e.status===404&&!b.path&&/empty/i.test((e.data&&e.data.message)||''))b.empty=true;else b.err=e.message}
 b.loading=false;render()}
async function listBranches(){const {data}=await gh(`/repos/${S.br.repo}/branches?per_page=100`);S.br.branches=data.map(x=>x.name)}

/* ---------- naming ---------- */
const isApk=f=>/\.apk$/i.test(f.name||'')||f.type==='application/vnd.android.package-archive';
function autoName(f){const n=f.name||'file';const i=n.lastIndexOf('.');let base=i>0?n.slice(0,i):n,ext=i>0?n.slice(i):'';
 const d=new Date(),p=x=>String(x).padStart(2,'0'),st=`${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
 if(S.settings.naming!=='keep')base=base.replace(/\s*\(\d+\)$/,'').replace(/[^\w.+-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')||'file';
 const apk=isApk(f);if(apk)ext='.apk';
 if((apk&&S.settings.apkStamp)||S.settings.naming==='timestamp')base+='-'+st;
 return base+ext}
const bump=n=>{const i=n.lastIndexOf('.');const [b,e]=i>0?[n.slice(0,i),n.slice(i)]:[n,''];const m=b.match(/^(.*)-(\d+)$/);return m?`${m[1]}-${+m[2]+1}${e}`:`${b}-1${e}`};

/* ---------- upload engine ---------- */
const ACTIVE=['uploading','committing'];
const isActive=i=>ACTIVE.includes(i.state);
const saveQ=()=>store.set('queue',S.queue.map(({file,xhr,...r})=>r));
function logHist(i){const e={id:i.id,name:i.name,size:i.size,repo:i.repo,branch:i.branch,path:i.path,state:i.state,ts:Date.now(),url:i.url||null,err:i.err||null,apk:i.apk};
 const k=S.history.findIndex(h=>h.id===i.id);if(k>=0)S.history.splice(k,1);S.history.unshift(e);S.history=S.history.slice(0,300);store.set('history',S.history)}
const b64=u8=>{let s='';for(let i=0;i<u8.length;i+=0x8000)s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));return btoa(s)};
async function buildBody(it){
 // Encode in aligned chunks so each temporary byte buffer is small. The final JSON
 // still has to contain one base64 value because GitHub's Contents API requires it.
 const parts=['{"message":'+JSON.stringify(it.msg)+',"branch":'+JSON.stringify(it.branch)+(it.sha?',"sha":"'+it.sha+'"':'')+',"content":"'];
 const CH=3*256*1024;for(let o=0;o<it.file.size;o+=CH){if(it.cancel)throw new Error('Upload cancelled');const end=Math.min(it.file.size,o+CH);parts.push(b64(new Uint8Array(await it.file.slice(o,end).arrayBuffer())));it.prep=end/it.file.size;saveQ()}
 parts.push('"}');return new Blob(parts,{type:'application/json'})}
function put(it,body){return new Promise(res=>{const x=new XMLHttpRequest();it.xhr=x;
 x.open('PUT',`${API}/repos/${it.repo}/contents/${encPath(it.path)}`);x.timeout=15*60*1000;
 x.setRequestHeader('Authorization','Bearer '+S.tok);x.setRequestHeader('Accept','application/vnd.github+json');x.setRequestHeader('Content-Type','application/json');
 let lt=Date.now(),lb=0;it.total=body.size;
 x.upload.onprogress=e=>{it.sent=e.loaded;it.total=e.total||body.size;const n=Date.now(),dt=(n-lt)/1000;
  if(dt>=.6){const v=(e.loaded-lb)/dt;it.speed=it.speed?it.speed*.6+v*.4:v;lt=n;lb=e.loaded}
  it.eta=it.speed?(it.total-it.sent)/it.speed:Infinity;if(it.sent>=it.total)it.state='committing'};
 x.onload=()=>{let d=null;try{d=JSON.parse(x.responseText)}catch{}res({status:x.status,data:d})};
 x.onerror=()=>res({status:0});x.ontimeout=()=>res({status:0});x.onabort=()=>res({status:-1});x.send(body)})}
async function fetchSha(it){try{const {data}=await gh(`/repos/${it.repo}/contents/${encPath(it.path)}?ref=${encodeURIComponent(it.branch)}`);return data.sha}catch{return null}}
async function run(it){
 it.state='uploading';it.err=null;it.sent=0;it.speed=0;it.eta=Infinity;it.prep=0;let body=null,key='',net=0;
 try{for(let a=0;a<30;a++){
  if(it.cancel){it.state='cancelled';break}
  if(!body||key!==it.path+'|'+it.sha){body=await buildBody(it);key=it.path+'|'+it.sha}
  it.state='uploading';it.sent=0;const r=await put(it,body);
  if(r.status===-1||it.cancel){it.state='cancelled';break}
  if(r.status===200||r.status===201){it.state='done';it.url=r.data&&r.data.content&&r.data.content.html_url;break}
  const m=(r.data&&r.data.message)||'';
  if(r.status===422&&/sha/i.test(m)){const pol=it.policy||S.settings.conflict;
   if(pol==='skip'){it.state='skipped';it.err='A file with this name already exists. Skipped.';break}
   if(pol==='overwrite'){const s=await fetchSha(it);if(!s){it.state='failed';it.err='Could not read the existing file to overwrite it.';break}it.sha=s;continue}
   if(pol==='rename'){it.path=it.path.replace(/[^/]+$/,x=>bump(x));it.name=it.path.split('/').pop();it.sha=null;continue}
   it.state='conflict';it.err='A file named "'+it.name+'" already exists in this folder.';break}
  if(r.status===409&&a<4){await sleep(1500*(a+1));if(it.sha){const s=await fetchSha(it);if(s)it.sha=s}continue}
  if((r.status===0||r.status>=500)&&net<2){net++;await sleep(2500*net);continue}
  it.state='failed';it.err=explain(r.status,r.data);if(r.status===401)signOut(true);break}
 }catch(e){if(it.cancel){it.state='cancelled';it.err='Upload cancelled.'}else{it.state='failed';it.err='Could not prepare the file: '+(e.message||'read error')+'. Try a smaller file or close other apps to free memory.'}}
 if(it.state==='uploading'||it.state==='committing')it.state='failed';
 it.xhr=null;it.speed=0;logHist(it);saveQ()}
function pump(){
 while(S.queue.filter(isActive).length<S.settings.concurrency){const n=S.queue.find(i=>i.state==='queued');if(!n)break;
  n.state='uploading';n.cancel=false;run(n).finally(()=>{pump();render()})}
 svcSync();render()}
let lastSvc=0,svcOn=false;
async function svcSync(force){const p=PL('RoohuNative');if(!p)return;const act=S.queue.filter(isActive),wait=S.queue.filter(i=>i.state==='queued');
 if(!act.length&&!wait.length){if(svcOn){svcOn=false;try{await p.service({action:'stop'})}catch{}
   const d=S.queue.filter(i=>i.state==='done').length,f=S.queue.filter(i=>i.state==='failed'||i.state==='conflict').length;
   if(d||f)try{await p.notifyDone({title:f?'Upload finished with issues':'Upload complete',text:`${d} uploaded${f?`, ${f} need attention`:''}`})}catch{}}return}
 if(!force&&Date.now()-lastSvc<1500)return;lastSvc=Date.now();
 const tot=act.reduce((a,i)=>a+(i.total||i.size),0),sent=act.reduce((a,i)=>a+(i.sent||0),0),sp=act.reduce((a,i)=>a+(i.speed||0),0);
 try{await p.service({action:'update',title:`Uploading ${act.length+wait.length} file${act.length+wait.length>1?'s':''}`,text:act[0]?`${act[0].name} · ${fmtB(sp)}/s`:'Preparing…',progress:tot?Math.min(99,Math.round(sent/tot*100)):-1});svcOn=true}catch{}}
setInterval(()=>{if(S.queue.some(isActive)){svcSync();if(!$('#sheet').classList.contains('on')&&['home','queue'].includes(S.view))render()}},600);

/* ---------- views ---------- */
const NAV=['home','repos','queue','history','settings','browse'];
const V={};
const head=(t,right='')=>`<div class="top"><h2 class="grow">${t}</h2>${right}</div>`;
const stateChip=s=>({queued:'<span class="chip">Queued</span>',uploading:'<span class="chip pr">Uploading</span>',committing:'<span class="chip pr">Committing</span>',done:'<span class="chip ok">Done</span>',failed:'<span class="chip er">Failed</span>',conflict:'<span class="chip wn">Conflict</span>',skipped:'<span class="chip wn">Skipped</span>',cancelled:'<span class="chip">Cancelled</span>'}[s]||'');
const overall=()=>{const a=S.queue.filter(i=>isActive(i)||i.state==='queued');const tot=a.reduce((x,i)=>x+(i.total||i.size),0),sent=a.reduce((x,i)=>x+(i.sent||0),0),sp=a.reduce((x,i)=>x+(i.speed||0),0);return {n:a.length,pct:tot?Math.round(sent/tot*100):0,sp,eta:sp?(tot-sent)/sp:Infinity}};
const bar=i=>{const pct=i.total?Math.min(100,i.sent/i.total*100):0;const prep=i.state==='uploading'&&!i.sent&&i.prep<1&&i.prep>=0;return `<div class="pb ${(i.state==='committing'||prep||(i.state==='uploading'&&!i.sent))?'ind':''}"><i style="width:${pct}%"></i></div>`};

V.onboard=()=>{const s=[['Upload from your phone straight to GitHub','Send APKs, assets and documents into any repository folder. No Termux, no terminal.'],['Track every upload','Live speed and time remaining, a retry queue and an Android upload notification while the app is running.'],['Clear about GitHub’s limits','Files up to 100 MB through the Contents API. You get a warning before anything too big is sent.']],i=S.obi;
 return `<div class="ob pg enter"><div class="orb"></div><div><div class="logo">ROOHU</div><h1>${s[i][0]}</h1><p>${s[i][1]}</p></div><div class="dots">${s.map((_,k)=>`<i class="${k===i?'on':''}"></i>`).join('')}</div><div class="row"><button class="b s" data-a="obskip">Skip</button><button class="b" data-a="obnext">${i===2?'Get started':'Next'}</button></div></div>`};

function permRows(){const sc=S.scopes,full=sc.includes('repo'),pub=sc.includes('public_repo');
 const R=[[S.user?'ok':'er','GitHub account',S.user?'@'+S.user.login:'Not connected'],
  [full?'ok':pub?'wn':'er','Repository access',full?'Public and private repositories':pub?'Public repositories only':'No repository permission'],
  [S.notif?'ok':'wn','Notifications',S.notif?'Allowed: progress shows while uploading':'Off: allow them to see background progress'],
  ['wn','Background status','A foreground notification is shown; Android may still stop the WebView process. Keep the app open for best reliability.'],
  ['ok','File access','Uses the system picker. No storage permission needed']];
 if(S.rate)R.push([S.rate.remaining>50?'ok':'wn','GitHub rate limit',`${S.rate.remaining} of ${S.rate.limit} requests left this hour`]);
 return R.map(([k,t,d])=>`<div class="perm"><i class="dot ${k==='ok'?'ok':k==='wn'?'wn':''}"></i><div class="grow"><b>${t}</b><small style="white-space:normal">${esc(d)}</small></div></div>`).join('')}

V.connect=()=>{const d=S.dev;
 if(d)return `<div class="pg enter">${head('Approve on GitHub')}<div class="c hero"><p>Enter this code on the GitHub page that opened:</p><div class="code">${esc(d.code)}</div><div class="row"><button class="b s" data-a="copyCode">Copy code</button><button class="b" data-a="reopen">Open GitHub</button></div></div>
 <div class="c"><div class="perm"><i class="dot wn"></i><div class="grow"><b>${esc(d.msg)}</b><small style="white-space:normal">You can switch to your browser and come back. This screen finishes automatically.</small></div></div></div><button class="b s" style="width:100%" data-a="cancelConnect">Cancel</button></div>`;
 return `<div class="pg enter"><div class="logo" style="margin-top:20px">ROOHU</div><h1>Connect GitHub</h1><p>Sign in through GitHub in your browser. Your password never touches this app, and the token is stored in the Android Keystore.</p>
 <div class="c"><label>OAuth Client ID</label><input type="text" data-c="cid" value="${esc(S.clientId)}" placeholder="Ov23li…" autocapitalize="off" autocomplete="off"><small style="white-space:normal">Create an OAuth App at github.com/settings/developers, tick “Enable Device Flow”, and paste its Client ID. One-time setup.</small></div>
 <div class="c"><label>Access to grant</label><div class="seg" style="margin:8px 0 0"><span class="chip on" data-a="scope" data-s="repo" id="sc1">All repos</span><span class="chip" data-a="scope" data-s="public_repo" id="sc2">Public only</span></div></div>
 <button class="b" style="width:100%" data-a="startConnect">${ic('link')} Connect with GitHub</button></div>`};

V.home=()=>{const o=overall(),done=S.history.filter(h=>h.state==='done'),today=done.filter(h=>new Date(h.ts).toDateString()===new Date().toDateString()).length,bytes=done.reduce((a,h)=>a+h.size,0),recent=S.history.slice(0,3);
 return `<div class="pg">${head('Hello'+(S.user?', '+esc(S.user.name||S.user.login):''),`<button class="ib" data-a="nav" data-v="settings">${ic('set')}</button>`)}
 <div class="c hero user">${S.user?`<img src="${esc(S.user.avatar_url)}" alt="">`:''}<div class="grow"><b>@${esc(S.user?.login||'')}</b><small>${S.scopes.includes('repo')?'Public and private repos':S.scopes.includes('public_repo')?'Public repos only':'Limited access'}</small></div><span class="chip ok">Connected</span></div>
 ${o.n?`<div class="c row" data-a="nav" data-v="queue"><div class="ring" style="--p:${o.pct}"><b>${o.pct}%</b></div><div class="grow"><b>Uploading ${o.n} file${o.n>1?'s':''}</b><small>${fmtB(o.sp)}/s · ${fmtT(o.eta)} left</small><div class="pb"><i style="width:${o.pct}%"></i></div></div></div>`:''}
 <div class="stats"><div class="c"><b>${today}</b><small>Today</small></div><div class="c"><b>${done.length}</b><small>Total</small></div><div class="c"><b>${fmtB(bytes)}</b><small>Sent</small></div></div>
 <div class="acts"><button class="b" data-a="openUpload">${ic('up')}Upload files</button><button class="b s" data-a="nav" data-v="repos">${ic('repo')}Browse repos</button></div>
 ${S.dest?`<div class="c row-i" data-a="openRepo" data-r="${esc(S.dest.repo)}"><div class="ico">${ic('folder')}</div><div class="grow"><b>Last destination</b><small>${esc(S.dest.repo)} / ${esc(S.dest.branch)} / ${esc(S.dest.path||'(root)')}</small></div></div>`:''}
 <div class="c"><b>Recent uploads</b>${recent.length?recent.map(h=>`<div class="perm"><i class="dot ${h.state==='done'?'ok':h.state==='failed'?'':'wn'}"></i><div class="grow"><b style="font-weight:550">${esc(h.name)}</b><small>${esc(h.repo)} · ${ago(h.ts)}</small></div></div>`).join(''):'<p style="margin:8px 0 0">Nothing uploaded yet. Tap Upload files to start.</p>'}</div>
 <div class="c"><small style="white-space:normal">GitHub’s Contents API accepts files up to 100 MB. Files over 25 MB are slow and may time out. Bigger files need Git LFS or a Release asset.</small></div></div>`};

V.repos=()=>{const q=S.repoQ.toLowerCase(),l=(S.repos||[]).filter(r=>r.full_name.toLowerCase().includes(q));
 return `<div class="pg">${head('Repositories',`<button class="ib" data-a="newRepo">${ic('plus')}</button>`)}<input type="search" data-c="rq" placeholder="Search repositories" value="${esc(S.repoQ)}">
 ${S.reposLoading?'<div class="empty">Loading your repositories…</div>':l.length?l.map(r=>`<div class="c row-i" data-a="openRepo" data-r="${esc(r.full_name)}"><div class="ico">${ic('repo')}</div><div class="grow"><b>${esc(r.name)}</b><small>${esc(r.owner.login)} · ${esc(r.default_branch)}${r.permissions&&!r.permissions.push?' · read-only':''}</small></div>${r.private?`<span class="chip">${ic('lock')}private</span>`:''}</div>`).join(''):`<div class="empty">${S.repos?'No repositories match.':'No repositories loaded.'}<br><br><button class="b s" data-a="reload">Reload</button></div>`}</div>`};

V.browse=()=>{const b=S.br;if(!b)return V.repos();const parts=b.path?b.path.split('/'):[];
 return `<div class="pg"><div class="top"><button class="ib" data-a="up">${ic('back')}</button><div class="grow"><h2 style="font-size:18px">${esc(b.repo.split('/')[1])}</h2><small>${esc(b.repo.split('/')[0])}${b.meta.permissions&&!b.meta.permissions.push?' · read-only':''}</small></div><button class="b s sm" data-a="branchSheet">${ic('branch')}${esc(b.branch)}</button></div>
 <div class="crumbs"><span class="chip pr" data-a="crumb" data-i="-1">root</span>${parts.map((p,i)=>`<span class="chip" data-a="crumb" data-i="${i}">${esc(p)}</span>`).join('')}</div>
 <div class="row" style="margin-bottom:12px"><button class="b sm" data-a="uploadHere">${ic('up')}Upload here</button><button class="b s sm" data-a="newFolder">${ic('folder')}New folder</button></div>
 ${b.loading?'<div class="empty">Loading…</div>':b.err?`<div class="c"><p style="color:var(--er)">${esc(b.err)}</p><button class="b s sm" data-a="reloadDir">Retry</button></div>`:b.empty?'<div class="empty">This repository is empty.<br>Your first upload creates the initial commit.</div>':!b.items.length?'<div class="empty">This folder is empty.</div>':b.items.map(f=>f.type==='dir'?`<div class="c row-i" data-a="enter" data-n="${esc(f.name)}"><div class="ico">${ic('folder')}</div><div class="grow"><b>${esc(f.name)}</b></div></div>`:`<div class="c row-i"><div class="ico ${/\.apk$/i.test(f.name)?'apk':''}">${ic(/\.apk$/i.test(f.name)?'pkg':'file')}</div><div class="grow"><b style="font-weight:550">${esc(f.name)}</b><small>${fmtB(f.size)}</small></div><button class="ib" data-a="delFile" data-n="${esc(f.name)}" data-sha="${f.sha}">${ic('trash')}</button></div>`).join('')}</div>`};

V.queue=()=>{const o=overall(),q=S.queue,fin=q.filter(i=>!isActive(i)&&i.state!=='queued');
 return `<div class="pg">${head('Upload queue',fin.length?`<button class="b s sm" data-a="clearDone">Clear finished</button>`:'')}
 ${o.n?`<div class="c hero"><div class="row"><div class="grow"><b>${o.pct}% · ${o.n} remaining</b><small>${fmtB(o.sp)}/s · ${fmtT(o.eta)} left</small></div></div><div class="pb"><i style="width:${o.pct}%"></i></div></div>`:''}
 ${q.some(i=>i.state==='failed'&&!i.lost)?`<button class="b s" style="width:100%;margin-bottom:12px" data-a="retryAll">${ic('retry')}Retry all failed</button>`:''}
 ${q.some(i=>i.lost)?`<div class="c"><b>Restore interrupted uploads</b><small style="white-space:normal">Android does not let this app reuse a file handle after it is closed. Select the same files again (same filename and size) to reconnect them to their original queue entries.</small><button class="b" style="width:100%;margin-top:10px" data-a="reattach">${ic('file')}Select files to restore</button></div>`:''}
 ${q.length?q.map(i=>`<div class="c"><div class="row"><div class="ico ${i.apk?'apk':''}">${ic(i.apk?'pkg':'file')}</div><div class="grow"><b>${esc(i.name)}</b><small>${esc(i.repo)} / ${esc(i.branch)} / ${esc(i.path.split('/').slice(0,-1).join('/')||'root')}</small></div>${stateChip(i.state)}</div>
  ${isActive(i)?`${bar(i)}<small>${fmtB(i.sent||0)} of ${fmtB(i.total||i.size)} · ${i.state==='committing'?'Committing to GitHub…':fmtB(i.speed||0)+'/s · '+fmtT(i.eta)+' left'}</small>`:`<small style="margin-top:6px">${fmtB(i.size)}</small>`}
  ${i.err&&i.state!=='done'?`<div class="warn ${i.state==='failed'?'er':''}">${esc(i.err)}</div>`:''}
  <div class="row" style="margin-top:10px">${i.state==='conflict'?`<button class="b sm" data-a="resolve" data-id="${i.id}" data-p="overwrite">Overwrite</button><button class="b s sm" data-a="resolve" data-id="${i.id}" data-p="rename">Keep both</button><button class="b s sm" data-a="resolve" data-id="${i.id}" data-p="skip">Skip</button>`:''}
  ${(i.state==='failed'||i.state==='cancelled')&&!i.lost?`<button class="b sm" data-a="retry" data-id="${i.id}">${ic('retry')}Retry</button>`:''}
  ${isActive(i)||i.state==='queued'?`<button class="b er sm" data-a="cancelItem" data-id="${i.id}">Cancel</button>`:`<button class="b s sm" data-a="removeItem" data-id="${i.id}">Remove</button>`}
  ${i.url&&i.state==='done'?`<button class="b s sm" data-a="openUrl" data-u="${esc(i.url)}">${ic('link')}View</button>`:''}</div></div>`).join(''):`<div class="empty">The queue is empty.<br><br><button class="b" data-a="openUpload">${ic('up')}Upload files</button></div>`}</div>`};

V.history=()=>{const l=S.history.filter(h=>S.hf==='all'||(S.hf==='done'?h.state==='done':h.state!=='done'));
 return `<div class="pg">${head('History',S.history.length?`<button class="b s sm" data-a="clearHist">Clear</button>`:'')}
 <div class="seg">${['all','done','issues'].map(f=>`<span class="chip ${S.hf===f?'on':''}" data-a="hf" data-f="${f}">${{all:'All',done:'Uploaded',issues:'Issues'}[f]}</span>`).join('')}</div>
 ${l.length?l.map(h=>`<div class="c"><div class="row"><div class="ico ${h.apk?'apk':''}">${ic(h.apk?'pkg':'file')}</div><div class="grow"><b>${esc(h.name)}</b><small>${esc(h.repo)} / ${esc(h.branch)} · ${fmtB(h.size)} · ${ago(h.ts)}</small></div>${stateChip(h.state)}</div>${h.err&&h.state!=='done'?`<div class="warn">${esc(h.err)}</div>`:''}${h.url?`<div class="row" style="margin-top:10px"><button class="b s sm" data-a="openUrl" data-u="${esc(h.url)}">${ic('link')}Open on GitHub</button></div>`:''}</div>`).join(''):'<div class="empty">No uploads here yet.</div>'}</div>`};

V.settings=()=>{const s=S.settings,sel=(k,opts)=>`<select data-k="${k}">${opts.map(([v,t])=>`<option value="${v}" ${String(s[k])===String(v)?'selected':''}>${t}</option>`).join('')}</select>`;
 return `<div class="pg">${head('Settings',`<button class="ib" data-a="refreshPerm">${ic('retry')}</button>`)}
 <div class="c"><b>Connection and permissions</b>${permRows()}${!S.notif?`<button class="b s sm" style="margin-top:10px" data-a="notifReq">Allow notifications</button>`:''}</div>
 <div class="c"><b>File naming</b><label>Rename on upload</label>${sel('naming',[['sanitize','Clean names (no spaces or “(1)”)'],['keep','Keep original names'],['timestamp','Add date and time']])}
 <label>APK files</label>${sel('apkStamp',[[true,'Add date and time to APK names'],[false,'Keep APK names']])}${sel('apkFolder',[[false,'Upload APKs to the chosen folder'],[true,'Put APKs in an “apk” subfolder']])}</div>
 <div class="c"><b>Uploading</b><label>If a file already exists</label>${sel('conflict',[['ask','Ask me in the queue'],['rename','Keep both (add -1)'],['overwrite','Overwrite'],['skip','Skip']])}
 <label>Files at once</label>${sel('concurrency',[[1,'1 (safest for one branch)'],[2,'2'],[3,'3']])}<label>Commit message</label><input type="text" data-k="msg" value="${esc(s.msg)}"><small style="white-space:normal">Use {name}, {size} and {date}.</small></div>
 <div class="c"><b>GitHub limits</b><p style="margin-top:8px">The Contents API accepts files up to 100 MB. Base64 encoding adds about a third to what is sent, so files above 25 MB may be slow or time out. GitHub warns above 50 MB. Files over 100 MB are blocked here, since they need Git LFS or a Release asset. Protected branches reject direct commits.</p></div>
 <div class="c"><b>Account</b><label>OAuth Client ID</label><input type="text" data-c="cid" value="${esc(S.clientId)}"><button class="b er" style="width:100%" data-a="signOut">Disconnect GitHub</button><small style="white-space:normal;margin-top:8px">Also revoke access at github.com/settings/applications.</small></div></div>`};

function navHtml(){const t=(id,ic_,l,extra='')=>`<button class="${S.nav===id?'on':''}" data-a="nav" data-v="${id}">${ic(ic_)}${l}${extra}</button>`;
 const n=S.queue.filter(i=>isActive(i)||i.state==='queued').length;
 return `<div class="nav">${t('home','home','Home')}${t('repos','repo','Repos')}<button class="fab" data-a="openUpload" aria-label="Upload files">${ic('up')}</button>${t('queue','queue','Queue',n?`<span class="badge">${n}</span>`:'')}${t('history','hist','History')}</div>`}
function render(anim){const a=$('#app');a.innerHTML=`<div class="pg ${anim?'enter':''}">${(V[S.view]||V.home)()}</div>`;
 if(anim)a.scrollTop=0;
 $('#nav').innerHTML=['onboard','connect','boot'].includes(S.view)?'':navHtml();
 const sc=S.form.scope||'repo';if($('#sc1')){$('#sc1').classList.toggle('on',sc==='repo');$('#sc2').classList.toggle('on',sc!=='repo')}}
function go(v){S.view=v;if(['home','repos','queue','history','settings'].includes(v))S.nav=v;if(v==='browse')S.nav='repos';render(true);if(v==='repos'&&!S.repos&&!S.reposLoading)loadRepos();if(v==='settings'||v==='connect')refreshPerm()}

/* ---------- sheets ---------- */
function openSheet(h){const s=$('#sheet');s.innerHTML=`<div class="sh"><div class="grab"></div>${h}</div>`;s.classList.add('on')}
function closeSheet(){$('#sheet').classList.remove('on');$('#sheet').innerHTML=''}
$('#sheet').addEventListener('click',e=>{if(e.target.id==='sheet')closeSheet()});

function openUpload(dest){
 const b=S.br,d=dest||(b?{repo:b.repo,branch:b.branch,path:b.path}:S.dest)||{};
 S.form=Object.assign(S.form,{repo:d.repo,branch:d.branch,path:d.path||'',msg:S.settings.msg,conflict:S.settings.conflict});S.pick=S.pick||[];upSheet()}
function upSheet(){const F=S.form,P=S.pick;
 if(!F.repo)return openSheet(`<h3>Choose a destination</h3><p>Open a repository first. You can pick its branch and folder there, then tap Upload here.</p><button class="b" style="width:100%" data-a="toRepos">Browse repositories</button>`);
 const ok=P.filter(p=>p.size<=LIM.hard);
 openSheet(`<h3>Upload files</h3>
 <div class="c" style="padding:12px"><div class="row"><div class="grow"><b>${esc(F.repo)}</b><small>Branch ${esc(F.branch)}</small></div><span class="chip pr">${ic('branch',12)}${esc(F.branch)}</span></div>
 <label>Folder (created if it does not exist)</label><input type="text" data-f="path" value="${esc(F.path)}" placeholder="root of repository" autocapitalize="off"></div>
 <button class="b s" style="width:100%;margin-bottom:12px" data-a="pickFiles">${ic('plus')}${P.length?'Add more files':'Select files'}</button>
 ${P.map((p,k)=>`<div class="c" style="padding:12px"><div class="row"><div class="ico ${p.apk?'apk':''}">${ic(p.apk?'pkg':'file')}</div><div class="grow"><input type="text" style="margin:0" data-p="${k}" value="${esc(p.name)}" autocapitalize="off"><small>${p.apk?'APK detected · ':''}${fmtB(p.size)}</small></div><button class="ib" data-a="rmPick" data-i="${k}">${ic('x')}</button></div>
 ${p.size>LIM.hard?`<div class="warn er">Over 100 MB. The Contents API cannot take this file. Use Git LFS or a Release asset instead. It will be left out.</div>`:p.size>LIM.warn?`<div class="warn">Large file. It may be slow or time out, and GitHub warns above 50 MB.</div>`:''}</div>`).join('')}
 <label>If a file already exists</label><select data-f="conflict">${[['ask','Ask me in the queue'],['rename','Keep both (add -1)'],['overwrite','Overwrite'],['skip','Skip']].map(([v,t])=>`<option value="${v}" ${F.conflict===v?'selected':''}>${t}</option>`).join('')}</select>
 <label>Commit message</label><input type="text" data-f="msg" value="${esc(F.msg)}">
 <button class="b" style="width:100%" data-a="startUpload" ${ok.length?'':'disabled'}>${ic('up')}Add ${ok.length||''} file${ok.length===1?'':'s'} to queue</button>`)}
function addPicks(files){let restored=0;for(const f of files){const lost=S.queue.find(i=>i.lost&&i.size===f.size&&i.name===f.name);if(lost){lost.file=f;lost.lost=false;lost.state='queued';lost.err=null;lost.cancel=false;restored++}else S.pick.push({file:f,name:autoName(f),size:f.size,apk:isApk(f)})}saveQ();if(restored){toast(`Restored ${restored} interrupted upload${restored===1?'':'s'}.`);pump()}if(S.pick.length)upSheet();else render()}
function queuePicks(){const F=S.form,seen=new Set(),dir=(F.path||'').trim().replace(/^\/+|\/+$/g,'');let n=0;
 for(const p of S.pick){if(p.size>LIM.hard)continue;let name=(p.name||'file').trim().replace(/[\\/]/g,'-');
  const folder=[dir,p.apk&&S.settings.apkFolder&&!/(^|\/)apk$/i.test(dir)?'apk':''].filter(Boolean).join('/');
  while(seen.has(folder+'/'+name))name=bump(name);seen.add(folder+'/'+name);
  S.queue.push({id:uid(),file:p.file,name,size:p.size,apk:p.apk,repo:F.repo,branch:F.branch,path:(folder?folder+'/':'')+name,msg:(F.msg||'Upload {name}').replace('{name}',name).replace('{size}',fmtB(p.size)).replace('{date}',new Date().toLocaleString()),state:'queued',policy:F.conflict==='ask'?null:F.conflict,sent:0,total:0,speed:0});n++}
 S.dest={repo:F.repo,branch:F.branch,path:dir};store.set('dest',S.dest);S.pick=[];saveQ();closeSheet();
 if(n){go('queue');pump();maybeAskNotif()}}
async function maybeAskNotif(){const p=PL('RoohuNative');if(!p||S.notif||store.get('nasked',false))return;store.set('nasked',true);try{S.notif=(await p.notifRequest()).enabled}catch{}}

/* ---------- actions ---------- */
const A={
 obnext(){if(S.obi<2){S.obi++;render()}else A.obskip()},obskip(){store.set('ob',1);go(S.tok?'home':'connect')},
 scope(d){S.form.scope=d.s;render()},
 startConnect(){startConnect(S.form.scope||'repo')},
 copyCode(){navigator.clipboard?.writeText(S.dev.code).then(()=>toast('Code copied'),()=>toast('Copy failed. Type the code manually.'))},
 reopen(){openUri(S.dev.uri)},cancelConnect(){S.dev=null;render()},
 nav(d){go(d.v)},reload(){loadRepos()},toRepos(){closeSheet();go('repos')},
 openRepo(d){openRepo(d.r)},
 up(){const b=S.br;if(b.path){b.path=b.path.split('/').slice(0,-1).join('/');loadDir()}else go('repos')},
 enter(d){S.br.path=(S.br.path?S.br.path+'/':'')+d.n;loadDir()},
 crumb(d){const i=+d.i;S.br.path=i<0?'':S.br.path.split('/').slice(0,i+1).join('/');loadDir()},
 reloadDir(){loadDir()},
 async branchSheet(){const b=S.br;openSheet('<h3>Branches</h3><p>Loading…</p>');
  try{if(!b.branches)await listBranches()}catch(e){return openSheet(`<h3>Branches</h3><p style="color:var(--er)">${esc(e.message)}</p>`)}
  openSheet(`<h3>Branch</h3>${b.branches.map(n=>`<div class="c row-i" data-a="setBranch" data-n="${esc(n)}"><div class="ico">${ic('branch')}</div><div class="grow"><b>${esc(n)}</b></div>${n===b.branch?'<span class="chip ok">current</span>':''}${n===b.meta.default_branch?'<span class="chip">default</span>':''}</div>`).join('')}
  <label>New branch from ${esc(b.branch)}</label><input type="text" data-f="nb" placeholder="feature/uploads" autocapitalize="off"><button class="b" style="width:100%" data-a="newBranch">${ic('plus')}Create branch</button>`)},
 setBranch(d){S.br.branch=d.n;closeSheet();loadDir()},
 async newBranch(){const n=(S.form.nb||'').trim().replace(/\s+/g,'-');if(!n)return toast('Enter a branch name');const b=S.br;
  try{const {data}=await gh(`/repos/${b.repo}/git/ref/heads/${encodeURIComponent(b.branch).replace(/%2F/g,'/')}`);
   await gh(`/repos/${b.repo}/git/refs`,{method:'POST',body:{ref:'refs/heads/'+n,sha:data.object.sha}});
   b.branches=null;b.branch=n;S.form.nb='';closeSheet();toast('Branch created');loadDir()}catch(e){toast(e.message)}},
 newFolder(){openSheet(`<h3>New folder</h3><p>GitHub stores folders through files, so a small .gitkeep file is added.</p><input type="text" data-f="nf" placeholder="folder-name" autocapitalize="off"><button class="b" style="width:100%" data-a="mkFolder">Create folder</button>`)},
 async mkFolder(){const n=(S.form.nf||'').trim().replace(/^\/+|\/+$/g,'');if(!n)return toast('Enter a folder name');const b=S.br,p=(b.path?b.path+'/':'')+n+'/.gitkeep';
  try{await gh(`/repos/${b.repo}/contents/${encPath(p)}`,{method:'PUT',body:{message:'Create folder '+n,content:'',branch:b.branch}});S.form.nf='';closeSheet();toast('Folder created');loadDir()}catch(e){toast(e.message)}},
 delFile(d){openSheet(`<h3>Delete file?</h3><p>${esc(d.n)} will be removed from ${esc(S.br.branch)} with a commit.</p><div class="row"><button class="b s" data-a="closeSheet">Keep it</button><button class="b er" data-a="doDel" data-n="${esc(d.n)}" data-sha="${esc(d.sha)}">Delete</button></div>`)},
 async doDel(d){const b=S.br;try{await gh(`/repos/${b.repo}/contents/${encPath((b.path?b.path+'/':'')+d.n)}`,{method:'DELETE',body:{message:'Delete '+d.n,sha:d.sha,branch:b.branch}});closeSheet();toast('Deleted');loadDir()}catch(e){toast(e.message)}},
 closeSheet(){closeSheet()},
 newRepo(){openSheet(`<h3>New repository</h3><input type="text" data-f="rn" placeholder="repository-name" autocapitalize="off"><input type="text" data-f="rd" placeholder="Description (optional)"><label>Visibility</label><select data-f="rp"><option value="1">Private</option><option value="0">Public</option></select><button class="b" style="width:100%" data-a="mkRepo">Create repository</button><small style="white-space:normal;margin-top:8px">A README is added so the main branch exists right away.</small>`)},
 async mkRepo(){const name=(S.form.rn||'').trim().replace(/\s+/g,'-');if(!name)return toast('Enter a repository name');
  try{const {data}=await gh('/user/repos',{method:'POST',body:{name,description:S.form.rd||'',private:S.form.rp!=='0',auto_init:true}});
   (S.repos=S.repos||[]).unshift(data);closeSheet();toast('Repository created');openRepo(data.full_name)}catch(e){toast(e.message)}},
 openUpload(){openUpload()},uploadHere(){openUpload()},
 pickFiles(){$('#fi').value='';$('#fi').click()},reattach(){$('#fi').value='';$('#fi').click()},rmPick(d){S.pick.splice(+d.i,1);upSheet()},startUpload(){queuePicks()},
 cancelItem(d){const i=S.queue.find(x=>x.id===d.id);if(!i)return;i.cancel=true;if(i.xhr)i.xhr.abort();else{i.state='cancelled';logHist(i);saveQ()}render()},
 retry(d){const i=S.queue.find(x=>x.id===d.id);if(i&&i.file){i.state='queued';i.err=null;i.cancel=false;saveQ();pump()}},
 retryAll(){S.queue.forEach(i=>{if(i.state==='failed'&&i.file){i.state='queued';i.err=null}});saveQ();pump()},
 resolve(d){const i=S.queue.find(x=>x.id===d.id);if(i){i.policy=d.p;i.state='queued';i.err=null;pump()}},
 removeItem(d){S.queue=S.queue.filter(x=>x.id!==d.id);saveQ();render()},
 clearDone(){S.queue=S.queue.filter(i=>isActive(i)||i.state==='queued');saveQ();render()},
 hf(d){S.hf=d.f;render()},clearHist(){S.history=[];store.set('history',[]);render()},
 openUrl(d){openUri(d.u)},signOut(){openSheet(`<h3>Disconnect GitHub?</h3><p>The saved token is erased from this phone. Queued uploads stay in the list.</p><div class="row"><button class="b s" data-a="closeSheet">Cancel</button><button class="b er" data-a="doSignOut">Disconnect</button></div>`)},
 doSignOut(){closeSheet();signOut()},refreshPerm(){refreshPerm();toast('Checking…')},
 async notifReq(){const p=PL('RoohuNative');if(!p)return toast('Notifications are available in the Android app');try{S.notif=(await p.notifRequest()).enabled;render()}catch{}}
};
document.addEventListener('click',e=>{const t=e.target.closest('[data-a]');if(!t)return;const f=A[t.dataset.a];if(f){e.stopPropagation();f(t.dataset,t)}});
document.addEventListener('input',e=>{const t=e.target;
 if(t.dataset.f){S.form[t.dataset.f]=t.value}
 else if(t.dataset.p!==undefined){S.pick[+t.dataset.p].name=t.value}
 else if(t.dataset.c==='cid'){S.clientId=t.value;store.set('cid',t.value)}
 else if(t.dataset.c==='rq'){S.repoQ=t.value;const pos=t.selectionStart;render();const n=$('[data-c=rq]');if(n){n.focus();n.setSelectionRange(pos,pos)}}});
document.addEventListener('change',e=>{const t=e.target;if(t.dataset.k){let v=t.value;if(v==='true')v=true;else if(v==='false')v=false;else if(t.dataset.k==='concurrency')v=+v;S.settings[t.dataset.k]=v;store.set('settings',S.settings)}
 if(t.dataset.f==='conflict')S.form.conflict=t.value});
$('#fi').addEventListener('change',e=>{const fs=[...e.target.files];if(fs.length)addPicks(fs)});

/* ---------- boot ---------- */
(async()=>{
 const B=PL('App');if(B){B.addListener('backButton',()=>{if($('#sheet').classList.contains('on'))return closeSheet();
  if(S.view==='browse')return A.up();if(['repos','queue','history','settings'].includes(S.view))return go('home');B.exitApp()});
  B.addListener('appStateChange',s=>{if(s.isActive)refreshPerm()})}
 S.tok=await secure.get('tok');
 if(S.tok){try{await loadUser()}catch(e){if(e.status===401){S.tok=null}}}
 if(!store.get('ob',0))S.view='onboard';else S.view=S.tok?'home':'connect';
 render(true);refreshPerm();
 if(S.queue.some(i=>i.lost))toast('Some uploads were interrupted when the app closed.');
})();
})();
