import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createRegistryClient,createVatClient} from './official-services.js';
import {createPortalClient} from './portal-client.js';
import {createTaxisnetRoutes} from './taxisnet-routes.js';
import {createServiceRoutes} from './service-routes.js';
import {openVault} from './vault.js';
import {createMyDataClient,ServiceError,validAfm,validateRange} from './mydata.js';
const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/integration.js':['integration.js','text/javascript'],'/services.js':['services.js','text/javascript'],'/taxisnet.js':['taxisnet.js','text/javascript']};
const hash=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
function setupMatch(input,expected){const code=String(input||'').replace(/\s/g,'').toLowerCase();return [24,64].includes(code.length)&&!!expected&&equal(code,expected.slice(0,code.length));}
export function createApp({directory=process.env.DATA_DIR||'/tmp/easyfinance-data',origin=process.env.PUBLIC_ORIGIN||'http://localhost:3000',production=process.env.NODE_ENV==='production',syncClient=createMyDataClient(),registryClient=createRegistryClient(),vatClient=createVatClient(),portalClient=createPortalClient()}={}){
 const vault=openVault(directory),sessions=new Map(),attempts=new Map();let syncing=false,lastSync=0;
 const cookieName=production?'__Host-ef_session':'ef_session';
 const cookie=(token,maxAge)=>`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${production?'; Secure':''}`;
 const send=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(body));};
 function limit(req){const now=Date.now();const client=production&&req.headers['x-forwarded-for']?String(req.headers['x-forwarded-for']).split(',').at(-1).trim():req.socket.remoteAddress;if(attempts.size>10000){for(const [key,value] of attempts)if(now-value.time>900000)attempts.delete(key);if(attempts.size>10000)attempts.delete(attempts.keys().next().value);}let item=attempts.get(client)||{time:now,count:0};if(now-item.time>900000)item={time:now,count:0};item.count++;attempts.set(client,item);if(item.count>20)throw new ServiceError('login_limit','Πολλές προσπάθειες εισόδου. Περίμενε 15 λεπτά.',429);}
 function session(req){const raw=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!raw)return null;const id=hash(raw),s=sessions.get(id);if(!s)return null;if(s.expires<Date.now()){sessions.delete(id);return null;}return {...s,id};}
 function startSession(res){const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');if(sessions.size>=10)sessions.delete(sessions.keys().next().value);sessions.set(hash(token),{csrf,expires:Date.now()+8*3600000});res.setHeader('Set-Cookie',cookie(token,8*3600));return csrf;}
 async function body(req){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new ServiceError('content_type','Απαιτείται JSON.',415);let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>8192)throw new ServiceError('body','Πολύ μεγάλο αίτημα.',413);parts.push(chunk);}try{const result=JSON.parse(Buffer.concat(parts).toString());if(!result||Array.isArray(result)||typeof result!=='object')throw Error();return result;}catch{throw new ServiceError('json','Μη έγκυρο αίτημα.',400);}}
 const taxisnetRoutes=createTaxisnetRoutes({vault,send,body,portalClient});
 const serviceRoutes=createServiceRoutes({vault,send,body,registryClient,vatClient,portalClient});
 const server=http.createServer(async(req,res)=>{
 if(production)res.setHeader('Strict-Transport-Security','max-age=15552000');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
 try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(!path.startsWith('/api/')){if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}const file=files[path];if(!file){res.writeHead(404);res.end('Not found');return;}const content=await readFile(new URL(file[0],import.meta.url));res.writeHead(200,{'Content-Type':file[1]+'; charset=utf-8'});res.end(req.method==='HEAD'?undefined:content);return;}
 const auth=session(req),state=vault.get();
 if(path==='/api/status'&&req.method==='GET'){send(res,200,{configured:!!state.owner,authenticated:!!auth,...(auth?{username:state.owner.username,csrf:auth.csrf}: {})});return;}
 if(req.method!=='GET'){
 if(req.headers.origin!==origin)throw new ServiceError('origin','Μη έγκυρη προέλευση αιτήματος.',403);
 if(!['/api/login','/api/setup'].includes(path)&&(!auth||!equal(req.headers['x-csrf-token']||'',auth.csrf)))throw new ServiceError('csrf','Η συνεδρία έληξε. Συνδέσου ξανά.',403);
 }
 if(path==='/api/setup'&&req.method==='POST'){
 limit(req);if(state.owner)throw new ServiceError('configured','Ο λογαριασμός έχει ήδη δημιουργηθεί.',409);const input=await body(req);if(!setupMatch(input.token,vault.setupToken()))throw new ServiceError('setup','Μη έγκυρος κωδικός αρχικής εγκατάστασης.',403);
 if(typeof input.username!=='string'||!(/^[A-Za-z0-9._@+-]{3,80}$/).test(input.username)||typeof input.password!=='string'||input.password.length<12||input.password.length>256)throw new ServiceError('account','Όνομα χρήστη 3–80 λατινικοί χαρακτήρες και κωδικός 12–256 χαρακτήρες.',400);
 const salt=randomBytes(16).toString('hex'),passwordHash=scryptSync(input.password,salt,64).toString('hex');if(vault.get().owner)throw new ServiceError('configured','Ο λογαριασμός υπάρχει ήδη.',409);vault.save({...vault.get(),owner:{username:input.username,salt,passwordHash}});vault.finishSetup();send(res,201,{csrf:startSession(res)});return;
 }
 if(path==='/api/login'&&req.method==='POST'){
 limit(req);const input=await body(req);if(typeof input.password!=='string'||input.password.length>256||typeof input.username!=='string')throw new ServiceError('login','Μη έγκυρα στοιχεία εισόδου.',401);const owner=vault.get().owner;
 const result=scryptSync(input.password,owner?.salt||'unconfigured-account',64).toString('hex');if(!owner||!equal(result,owner.passwordHash)||!equal(input.username,owner.username))throw new ServiceError('login','Μη έγκυρα στοιχεία εισόδου.',401);send(res,200,{csrf:startSession(res)});return;
 }
 if(!auth)throw new ServiceError('auth','Απαιτείται σύνδεση.',401);
 if(await taxisnetRoutes(req,res,path))return;
 if(await serviceRoutes(req,res,path))return;
 if(path==='/api/logout'&&req.method==='POST'){sessions.delete(auth.id);if(portalClient.available)portalClient.call('/close').catch(()=>{});send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});return;}
 if(path==='/api/mydata'&&req.method==='GET'){const c=state.credentials;send(res,200,{connection:c?{afm:c.afm,username:c.username,environment:c.environment}:null,snapshot:state.snapshot,syncing});return;}
 if(path==='/api/mydata/credentials'&&req.method==='POST'){
 const input=await body(req);if(!validAfm(input.afm)||typeof input.username!=='string'||!(/^[\x21-\x7e]{1,100}$/).test(input.username)||typeof input.key!=='string'||!(/^[\x21-\x7e]{10,512}$/).test(input.key)||!['sandbox','production'].includes(input.environment))throw new ServiceError('credentials','Έλεγξε ΑΦΜ, όνομα χρήστη, κλειδί και περιβάλλον.',400);
 if((vault.get().registryCredentials&&vault.get().registryCredentials.afm!==input.afm)||(vault.get().businessAfm&&vault.get().businessAfm!==input.afm))throw new ServiceError('afm_mismatch','Το ΑΦΜ πρέπει να συμφωνεί με το μητρώο.',400);vault.save({...vault.get(),credentials:{afm:input.afm,username:input.username,key:input.key,environment:input.environment},snapshot:null,vatSnapshot:null});send(res,200,{ok:true});return;
 }
 if(path==='/api/mydata/credentials'&&req.method==='DELETE'){vault.save({...vault.get(),credentials:null,snapshot:null,vatSnapshot:null});send(res,200,{ok:true});return;}
 if(path==='/api/mydata/sync'&&req.method==='POST'){
 const input=await body(req);validateRange(input.from,input.to);const credentials=vault.get().credentials;if(!credentials)throw new ServiceError('missing','Καταχώρησε πρώτα στοιχεία myDATA.',400);if(syncing)throw new ServiceError('busy','Ο συγχρονισμός εκτελείται ήδη.',409);if(Date.now()-lastSync<10000)throw new ServiceError('cooldown','Περίμενε 10 δευτερόλεπτα πριν ξαναδοκιμάσεις.',429);
 syncing=true;lastSync=Date.now();try{const snapshot=await syncClient(credentials,input.from,input.to);if(vault.get().credentials!==credentials)throw new ServiceError('changed','Τα στοιχεία σύνδεσης άλλαξαν. Επανάλαβε τον συγχρονισμό.',409);vault.save({...vault.get(),snapshot});send(res,200,{snapshot});}finally{syncing=false;}return;
 }
 throw new ServiceError('not_found','Δεν βρέθηκε η λειτουργία.',404);
 }catch(error){if(error instanceof ServiceError)send(res,error.status,{error:error.message,code:error.code});else{console.error('Request failed without logging request contents');send(res,500,{error:'Προέκυψε σφάλμα. Τα προηγούμενα δεδομένα διατηρήθηκαν.',code:'internal'});}}
 });server.requestTimeout=150000;server.headersTimeout=15000;return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||3000);createApp().listen(port,'0.0.0.0',()=>console.log(`EasyFinance running on port ${port}`));}
