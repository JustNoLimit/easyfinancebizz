import {randomUUID} from 'node:crypto';
import {ServiceError} from './mydata.js';
const sourceNames={myaade:'Οφειλές ΔΟΥ',business:'Στοιχεία επιχείρησης',vatreturn:'Δηλώσεις ΦΠΑ',employer:'ΕΦΚΑ εργοδότη',keao:'ΚΕΑΟ',efka:'ΕΦΚΑ μη μισθωτών'};
const afmOf=s=>s.businessAfm||s.credentials?.afm||s.registryCredentials?.afm;
const safeSnapshot=s=>({...s,document:s.document?{available:true,downloadedAt:s.document.downloadedAt}:null});
const validCredentials=c=>typeof c?.username==='string'&&c.username.trim().length>0&&c.username.length<=150&&typeof c.password==='string'&&c.password.length>0&&c.password.length<=300&&!/[\x00-\x1f]/.test(c.username+c.password);
export function createTaxisnetRoutes({vault,send,body,portalClient}){
 let job=null,lastStart=0;
 const pendingSession=service=>{const value=vault.get().pendingPortalSessions?.[service];return value&&Date.now()-Date.parse(value.createdAt)<900000?value:null;};
 const savedSession=service=>{const own=vault.get().portalSessions?.[service]||pendingSession(service);if(own)return own;const family=['myaade','vatreturn','business'].includes(service)?['myaade','vatreturn','business']:['employer','efka','keao'];for(const key of family){const candidate=vault.get().portalSessions?.[key];if(candidate?.verifiedAfm===afmOf(vault.get()))return {...candidate,url:undefined};}return null;};
 const scope=()=>`${vault.get().owner?.username}:${afmOf(vault.get())}:${vault.get().taxisnetVersion||0}`;
 const busy=()=>{if(job&&job.scope!==scope()){job=null;portalClient.call('/close').catch(()=>{});}return job&&['running','needs_verification'].includes(job.status);};
 const summary=()=>({available:portalClient.available,afm:afmOf(vault.get())||null,sources:sourceNames,job,snapshots:Object.fromEntries(Object.entries(vault.get().collectionSnapshots||{}).map(([k,v])=>[k,safeSnapshot(v)]))});
 function decode(input){let c;try{c=vault.unseal(input.token,scope());}catch{throw new ServiceError('taxisnet_token','Η αποθηκευμένη σύνδεση δεν είναι έγκυρη. Καταχώρησε ξανά τους κωδικούς Taxisnet.',400);}if(!validCredentials(c))throw new ServiceError('taxisnet_credentials','Έλεγξε τα στοιχεία Taxisnet.',400);return c;}
 async function execute(current,credentials,resume=false){
  const stillCurrent=()=>job===current&&scope()===current.scope;
  try{
   for(let index=current.index;index<current.services.length;index++){
    if(!stillCurrent())return;
    const service=current.services[index];current.index=index;current.current=service;current.results[service]={status:'running',message:'Λήψη από την επίσημη υπηρεσία…'};
    vault.save({...vault.get(),collectionAttempts:{...vault.get().collectionAttempts,[service]:{status:'running',startedAt:new Date().toISOString(),credentialsPresent:!!credentials?.username&&!!credentials?.password}}});
    let result;
    try{result=await portalClient.call('/collect',{service,afm:current.afm,username:credentials?.username,password:credentials?.password,saved:savedSession(service),resume:resume&&index===current.resumeIndex});}catch{result={status:'error',code:'upstream',message:'Η σύνδεση με την επίσημη υπηρεσία απέτυχε. Τα προηγούμενα στοιχεία διατηρήθηκαν.'};}
    if(!stillCurrent())return;
    vault.save({...vault.get(),collectionAttempts:{...vault.get().collectionAttempts,[service]:{...vault.get().collectionAttempts?.[service],status:result.status==='success'?'success':result.status==='needs_verification'?'needs_verification':'error',code:['auth_failed','auth_locked','credentials_missing','needs_verification','identity_unverified','source_changed','source_unknown','upstream'].includes(result.code)?result.code:null,finishedAt:new Date().toISOString()}}});
    if(['identity','authentication'].includes(result.diagnostic?.stage)&&Array.isArray(result.diagnostic.frames)){const frames=result.diagnostic.frames.slice(0,8).map(f=>({location:typeof f.location==='string'?f.location.slice(0,300):'',labeledAfmPresent:f.labeledAfmPresent===true,expectedAfmPresent:f.expectedAfmPresent===true,passwordPresent:f.passwordPresent===true,loading:f.loading===true,errorNotice:f.errorNotice===true,sessionNotice:f.sessionNotice===true,navigation:Array.isArray(f.navigation)?f.navigation.slice(0,30).map(n=>({kind:['profile','debts','personal-information'].includes(n.kind)?n.kind:'other',location:typeof n.location==='string'?n.location.slice(0,300):'',imageLabel:n.imageLabel===true})):[]}));vault.save({...vault.get(),collectionDiagnostics:{...vault.get().collectionDiagnostics,[service]:{stage:result.diagnostic.stage,reason:['auth_failed','auth_locked','credentials_missing','needs_verification'].includes(result.diagnostic.reason)?result.diagnostic.reason:null,frames,checkedAt:new Date().toISOString()}}});}
    if(['identity_unverified','source_unknown','auth_failed','auth_locked','needs_verification'].includes(result.code)&&result.pendingSession?.storage&&typeof result.pendingSession.url==='string'){vault.save({...vault.get(),pendingPortalSessions:{...vault.get().pendingPortalSessions,[service]:{...result.pendingSession,createdAt:new Date().toISOString()}}});}
    if(result.status==='success'){
     if(result.snapshot?.afm!==current.afm||result.snapshot?.service!==service||!result.snapshot?.collection||result.snapshot.collection.kind!==service){current.results[service]={status:'error',code:'identity',message:'Δεν επιβεβαιώθηκε η ταυτότητα των δεδομένων.'};continue;}
     vault.save({...vault.get(),collectionSnapshots:{...vault.get().collectionSnapshots,[service]:result.snapshot},portalSessions:{...vault.get().portalSessions,[service]:result.saved}});
     current.results[service]={status:'success',message:'Τα στοιχεία ενημερώθηκαν.',updatedAt:result.snapshot.capturedAt};
    }else{
     const code=['needs_verification','auth_failed','auth_locked','credentials_missing','identity_unverified','source_changed','source_unknown','upstream'].includes(result.code)?result.code:'upstream';
     const messages={auth_locked:'Η επίσημη υπηρεσία αναφέρει κλειδωμένο ή ανενεργό λογαριασμό. Δεν έγιναν άλλες προσπάθειες.',credentials_missing:'Καταχώρησε ξανά τους κανονικούς κωδικούς Taxisnet στις Ρυθμίσεις.',needs_verification:'Η επίσημη υπηρεσία ζητά επιβεβαίωση. Πάτησε «Επιβεβαίωση» και έπειτα «Συνέχεια ενημέρωσης».',auth_failed:'Τα στοιχεία Taxisnet δεν έγιναν δεκτά. Έλεγξέ τα πριν δοκιμάσεις ξανά.',identity_unverified:'Δεν επιβεβαιώθηκε το ΑΦΜ της επιχείρησης. Τα προηγούμενα στοιχεία διατηρήθηκαν.',source_unknown:'Δεν επιβεβαιώθηκαν τα στοιχεία ή η επιλεξιμότητα του λογαριασμού στην υπηρεσία. Τα προηγούμενα στοιχεία διατηρήθηκαν.',source_changed:'Δεν αναγνωρίστηκαν τα στοιχεία στην επίσημη υπηρεσία. Τα προηγούμενα στοιχεία διατηρήθηκαν.',upstream:'Η επίσημη υπηρεσία δεν ανταποκρίθηκε. Τα προηγούμενα στοιχεία διατηρήθηκαν.'};
     current.results[service]={status:code==='needs_verification'?'needs_verification':'error',code,message:messages[code]};
     if(code==='needs_verification'){current.status='needs_verification';return;}
     if(['auth_failed','auth_locked','credentials_missing','identity_unverified'].includes(code)){for(const next of current.services.slice(index+1))current.results[next]={status:'skipped',message:'Η λήψη σταμάτησε για έλεγχο στοιχείων σύνδεσης.'};break;}
    }
   }
   current.status=Object.values(current.results).every(r=>r.status==='success')?'success':'partial';current.current=null;current.finishedAt=new Date().toISOString();
  }catch{if(stillCurrent()){current.status='error';current.finishedAt=new Date().toISOString();}}
  finally{if(credentials){credentials.password=null;credentials.username=null;}}
 }
 return async function(req,res,path){
  if(path.startsWith('/api/portal')&&busy()){
   const permitted=job.status==='needs_verification'&&['/api/portal/frame','/api/portal/action','/api/portal/close'].includes(path);
   if(!permitted)throw new ServiceError('taxisnet_busy','Περίμενε να ολοκληρωθεί η ενημέρωση Taxisnet.',409);
  }
  if(!path.startsWith('/api/taxisnet'))return false;
  if(path==='/api/taxisnet'&&req.method==='GET'){busy();const info=summary();if(info.job){const {scope:privateScope,...publicJob}=info.job;info.job=publicJob;}send(res,200,info);return true;}
  if(path==='/api/taxisnet/credentials'&&req.method==='POST'){
   const input=await body(req);if(!afmOf(vault.get()))throw new ServiceError('afm','Αποθήκευσε πρώτα το ΑΦΜ της επιχείρησης.',400);
   if(!validCredentials(input))throw new ServiceError('taxisnet_credentials','Συμπλήρωσε το κανονικό όνομα χρήστη και τον κωδικό Taxisnet.',400);
   const token=vault.seal({username:input.username.trim(),password:input.password},scope());input.password=null;send(res,200,{token,username:input.username.trim(),afm:afmOf(vault.get())});return true;
  }
  if(path==='/api/taxisnet/credentials'&&req.method==='DELETE'){
   job=null;vault.save({...vault.get(),taxisnetVersion:(vault.get().taxisnetVersion||0)+1,collectionSnapshots:{},collectionDiagnostics:{},collectionAttempts:{},pendingPortalSessions:{},portalSessions:{},portalSnapshots:{}});portalClient.call('/close').catch(()=>{});send(res,200,{ok:true});return true;
  }
  if(path==='/api/taxisnet/sync'&&req.method==='POST'){
   if(!portalClient.available)throw new ServiceError('worker_missing','Η υπηρεσία σύνδεσης δεν είναι διαθέσιμη.',503);
   if(busy())throw new ServiceError('taxisnet_busy','Υπάρχει ήδη ενημέρωση σε εξέλιξη.',409);
   if(Date.now()-lastStart<10000)throw new ServiceError('cooldown','Περίμενε 10 δευτερόλεπτα πριν δοκιμάσεις ξανά.',429);
   const input=await body(req),credentials=decode(input),selected=input.services||Object.keys(sourceNames);
   if(!Array.isArray(selected)||!selected.length||selected.length>Object.keys(sourceNames).length||selected.some(k=>!Object.hasOwn(sourceNames,k))||new Set(selected).size!==selected.length)throw new ServiceError('source','Μη έγκυρες υπηρεσίες.',400);
   job={id:randomUUID(),scope:scope(),afm:afmOf(vault.get()),services:selected,status:'running',current:null,index:0,startedAt:new Date().toISOString(),results:Object.fromEntries(selected.map(k=>[k,{status:'pending',message:'Σε αναμονή'}]))};lastStart=Date.now();const current=job;queueMicrotask(()=>execute(current,credentials));send(res,202,{id:job.id});return true;
  }
  if(path==='/api/taxisnet/resume'&&req.method==='POST'){
   if(job?.status!=='needs_verification'||job.scope!==scope())throw new ServiceError('job','Δεν υπάρχει επιβεβαίωση σε αναμονή.',409);
   const input=await body(req),credentials=decode(input);job.resumeIndex=job.index;job.status='running';const current=job;queueMicrotask(()=>execute(current,credentials,true));send(res,202,{id:job.id});return true;
  }
  if(path==='/api/taxisnet/cancel'&&req.method==='POST'){job=null;portalClient.call('/close').catch(()=>{});send(res,200,{ok:true});return true;}
  if(path==='/api/taxisnet/document'&&req.method==='GET'){
   const key=new URL(req.url,'http://localhost').searchParams.get('service'),document=vault.get().collectionSnapshots?.[key]?.document;if(!Object.hasOwn(sourceNames,key)||!document?.base64)throw new ServiceError('document','Δεν υπάρχει αποθηκευμένο PDF.',404);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename=taxisnet-document.pdf'});res.end(Buffer.from(document.base64,'base64'));return true;
  }
  throw new ServiceError('not_found','Δεν βρέθηκε η λειτουργία.',404);
 };
}
