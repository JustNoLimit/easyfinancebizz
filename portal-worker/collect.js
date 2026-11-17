import {collectVatReturn} from './vat-collector.js';
import {collectIndividualEfka,individualGate} from './efka-collector.js';
import {collectEmployerFinancialCard} from './employer-collector.js';
import {collectKeao,collectCorporateKeao} from './keao-collector.js';
import {officialUrl,blockedControl} from './policy.js';
import {verifyIdentity,identityDiagnostic,officialFrames} from './identity.js';
import {taxisnetForm,submitTaxisnet,startTaxisnet,authenticationFailure,advanceEfkaHandoff} from './login.js';

export const collectionSources={
 business:'Στοιχεία επιχείρησης',myaade:'Οφειλές ΔΟΥ',vatreturn:'Δηλώσεις ΦΠΑ',employer:'ΕΦΚΑ εργοδότη',keao:'ΚΕΑΟ',efka:'ΕΦΚΑ μη μισθωτών'
};
const messages={
 needs_verification:'Η επίσημη υπηρεσία ζητά επιβεβαίωση. Ολοκλήρωσέ την για να συνεχιστεί η αυτόματη λήψη.',
 auth_locked:'Ο λογαριασμός Taxisnet αναφέρεται ως κλειδωμένος ή ανενεργός. Δεν έγιναν άλλες προσπάθειες.',
 credentials_missing:'Απαιτείται ξανά καταχώρηση των κανονικών κωδικών Taxisnet.',
 auth_failed:'Η επίσημη υπηρεσία δεν δέχτηκε τα στοιχεία Taxisnet. Έλεγξε όνομα χρήστη και κωδικό.',
 identity_unverified:'Δεν επιβεβαιώθηκε το ΑΦΜ της επιχείρησης. Δεν αποθηκεύτηκαν στοιχεία άλλου λογαριασμού.',
 source_changed:'Η ενότητα δεν αναγνωρίστηκε στην επίσημη υπηρεσία. Τα προηγούμενα στοιχεία διατηρήθηκαν.',
 upstream:'Η επίσημη υπηρεσία δεν ανταποκρίθηκε. Τα προηγούμενα στοιχεία διατηρήθηκαν.'
};
export function collectionError(code){return {status:code==='needs_verification'?'needs_verification':'error',code,message:messages[code]||messages.upstream};}
export function identityMatches(afm,text){return /^\d{9}$/.test(afm)&&new RegExp('(^|[^0-9])'+afm+'([^0-9]|$)').test(text);}
export function recognizedFinancial(data){return !!data&&typeof data==='object'&&!Array.isArray(data)&&!data.error&&(Array.isArray(data.contributions)||Array.isArray(data.settledDebtsList)&&Array.isArray(data.unsettledDebtsList));}
export function financialRows(snapshot){
 const tables=(snapshot.tables||[]).filter(rows=>Array.isArray(rows)&&rows.length>1&&rows.every(row=>Array.isArray(row)&&row.every(cell=>typeof cell==='string'))&&rows[0].some(cell=>/ποσ[όο]|οφειλ|υπ[όο]λοιπ|πληρωτ|περ[ίι]οδος|χρεωστικ|πιστωτικ|debt|amount|balance/i.test(cell))&&rows.slice(1).some(row=>row.some(cell=>/[0-9]/.test(cell))));
 const empty=String(snapshot.text||'').split(/\n/).some(line=>/δεν (?:υπ[άα]ρχουν|βρ[έε]θηκαν|[έε]χετε)\s+(?:(?:βεβαιωμ[έε]νες|ρυθμισμ[έε]νες)\s+)?(?:οφειλ[έε]ς|εγγραφ[έε]ς|δηλ[ώω]σεις)|καμ[ίι]α οφειλ[ήη]/i.test(line)&&!/εαν|εφοσον|περιπτωση|αν δεν|if you|in case/i.test(line.normalize('NFD').replace(/\p{M}/gu,'')));
 const api=(snapshot.apiData||[]).filter(record=>recognizedFinancial(record.data));
 if(!tables.length&&!api.length&&!empty)return null;
 return {tables,empty:empty&&!tables.length&&!api.length,apiData:api};
}
// Normalize Greek accents/case and accessible labels, including legacy image/input navigation.
export const foldGreek=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/g,' ').trim();
export async function follow(getPage,pattern){
 const p=getPage();if(!p||!officialUrl(p.url()))return false;
 const foldedPattern=new RegExp(foldGreek(pattern.source),pattern.flags.replace(/[gy]/g,''));
 for(const frame of officialFrames(p)){
  const controls=frame.locator('a:visible,button:visible,input[type=button]:visible,input[type=submit]:visible,[role="tab"]:visible,[role="link"]:visible');
  for(let i=0;i<Math.min(await controls.count(),160);i++){
   const el=controls.nth(i);if(!await el.isEnabled()||await el.getAttribute('aria-disabled')==='true')continue;
   const candidates=await el.evaluate(e=>[e.innerText,e.getAttribute('aria-label'),e.getAttribute('title'),e.tagName==='INPUT'?e.value:'',...Array.from(e.querySelectorAll('img[alt]')).map(img=>img.alt)].filter(Boolean));
   const label=candidates.find(value=>foldedPattern.test(foldGreek(value)))||'';const folded=foldGreek(label);
   if(!foldedPattern.test(folded)||label.length>250||blockedControl(folded)||/υποβολη|αιτηση|αποδοχη|εξουσιοδοτηση|πληρωσε|καταβολη/i.test(folded))continue;
   const href=await el.getAttribute('href');if(href&&!href.startsWith('#')&&!/^javascript:/i.test(href)){
    const url=new URL(href,frame.url());if(!officialUrl(url.href)||url.href===frame.url())continue;
   }
   await el.click({timeout:5000,noWaitAfter:true});await getPage().waitForTimeout(1200);return true;
  }
 }
 return false;
}
// These are observed legacy read pages. Their names include "AndPay", but only GET navigation is allowed.
const legacyDebtPaths={unregulated:'/taxisnet/info/protected/displayDebtInfoAndPay.htm',arranged:'/taxisnet/info/protected/displayArrangementInfoAndPay.htm'};
export async function openLegacyDebtView(getPage,kind){
 const target=legacyDebtPaths[kind],p=getPage();if(!target||!p)return false;
 const current=new URL(p.url());if(current.origin==='https://www1.aade.gr'&&current.pathname===target)return true;
 if(current.origin==='https://www1.aade.gr'&&current.pathname.startsWith('/taxisnet/info/protected/')){await p.goto(current.origin+target,{waitUntil:'domcontentloaded',timeout:20000});await p.waitForTimeout(800);return true;}
 for(const frame of officialFrames(p)){
  const links=frame.locator('a[href]');for(let n=0;n<await links.count();n++){
   const href=await links.nth(n).getAttribute('href');if(!href)continue;
   const url=new URL(href,frame.url());if(url.origin!=='https://www1.aade.gr'||url.pathname!==target)continue;
   await p.goto(url.origin+url.pathname,{waitUntil:'domcontentloaded',timeout:20000});await p.waitForTimeout(800);return true;
  }
 }return false;
}
async function proof(getPage,afm){
 const p=getPage();if(await verifyIdentity(p,afm))return true;
 if(new URL(p.url()).hostname==='services.e-efka.gov.gr'){
  // Read only the official application's known user identity object, never its token store.
  const ids=await p.evaluate(()=>{try{const data=JSON.parse(localStorage.getItem('efka_user_data')||'null');const found=[];const visit=(v,depth)=>{if(!v||depth>6||typeof v!=='object')return;for(const[k,value]of Object.entries(v)){if(/^(afm|tin|taxNumber|taxIdentificationNumber|vatNumber)$/i.test(k)&&typeof value==='string')found.push(value);else if(value&&typeof value==='object')visit(value,depth+1);}};visit(data,0);return found;}catch{return [];}});
  if(ids.includes(afm))return true;
 }
 return false;
}
async function settled(getPage,service,afm){const completed=new Set();for(let i=0;i<30;i++){const p=getPage();if(!p||!officialUrl(p.url())){await new Promise(r=>setTimeout(r,500));continue;}if(['employer','efka','keao'].includes(service)&&await advanceEfkaHandoff(p,afm,completed)){await p.waitForTimeout(500);continue;}const rejection=await authenticationFailure(p).catch(()=>null);if(rejection)return rejection;if(!(await taxisnetForm(p))&&!/login|oauth2server|openid-connect\/auth|\/mylogin\//i.test(new URL(p.url()).pathname)&&await p.locator('input[type=password]:visible,input[autocomplete=one-time-code]:visible').count()===0)return 'ready';await p.waitForTimeout(500);}return 'needs_verification';}

export async function collectPortal(input,{open,getPage,capture,verified,close,saveSession}){
 const {service,afm}=input;
 if(!collectionSources[service]||!/^\d{9}$/.test(afm))throw Error('Invalid collection request');
 let keep=false;
 const proveSelected=async()=>{if(!await proof(getPage,afm))return false;verified(afm);return true;};
 try{
  if(!input.resume)await open({service,saved:input.saved});
  let p=getPage();if(!p||!officialUrl(p.url()))return collectionError('upstream');
  if(!input.resume&&!await taxisnetForm(p)&&new URL(p.url()).hostname==='www1.aade.gr'&&/\/(?:aadeapps3|gsisapps5)\/myaade\/?$/.test(new URL(p.url()).pathname)){
   await startTaxisnet(p,service).catch(()=>{});p=getPage();
   if(!await taxisnetForm(p)&&/\/(?:aadeapps3|gsisapps5)\/myaade\/?$/.test(new URL(p.url()).pathname)){keep=true;return {...collectionError('needs_verification'),diagnostic:await identityDiagnostic(p,afm)};}
  }
  if(!input.resume&&await taxisnetForm(p)){
   if(!input.username||!input.password)return {...collectionError('credentials_missing'),diagnostic:{...await identityDiagnostic(p,afm),stage:'authentication',reason:'credentials_missing'}};
   await submitTaxisnet(p,{username:input.username,password:input.password});
  }
  const state=await settled(getPage,service,afm);if(state!=='ready'){keep=true;const form=await taxisnetForm(getPage());if(form&&['auth_failed','auth_locked'].includes(state)){await form.password.fill('').catch(()=>{});await form.username.fill('').catch(()=>{});}return {...collectionError(state),diagnostic:{...await identityDiagnostic(getPage(),afm),stage:'authentication',reason:state},pendingSession:await saveSession?.()};}
  if(['employer','efka','keao'].includes(service)&&individualGate(await getPage().locator('body').innerText().catch(()=>''))){keep=true;return {...collectionError('needs_verification'),diagnostic:{...await identityDiagnostic(getPage(),afm),stage:'authentication',reason:'needs_verification'},pendingSession:await saveSession?.()};}
  if(service==='keao'&&new URL(getPage().url()).pathname==='/ssp.efka.keao/views/eDebtorCM/mainCM.xhtml'){
   const result=await collectCorporateKeao(afm,{getPage,capture,verify:proveSelected});if(result.status==='needs_verification'){keep=true;return {...result,pendingSession:await saveSession?.()};}return result;
  }
  if(service==='employer'){
   const result=await collectEmployerFinancialCard({afm},{getPage,capture,verify:proveSelected});if(result.status==='needs_verification'){keep=true;return {...result,pendingSession:await saveSession?.()};}if(result.status==='success')verified(afm);if(['identity_unverified','source_unknown'].includes(result.code))return {...result,diagnostic:await identityDiagnostic(getPage(),afm),pendingSession:await saveSession?.()};return result;
  }
  if(service==='myaade')await openLegacyDebtView(getPage,'unregulated');
  p=getPage();const landing=p.url();let matched=await proof(getPage,afm);
  if(!matched){
   for(let n=0;n<4&&!matched;n++){await getPage().waitForTimeout(750);matched=await proof(getPage,afm);}
  }
  if(!matched){await follow(getPage,/^(?:Μητρώο(?:\s*(?:&|και).*)?|Στοιχεία (?:Μητρώου|φορολογούμενου|χρήστη|επιχείρησης).*|Προσωπικά στοιχεία|Προφίλ|Τα στοιχεία μου)$/i);for(let n=0;n<4&&!matched;n++){await getPage().waitForTimeout(750);matched=await proof(getPage,afm);}}
  if(!matched)return {...collectionError('identity_unverified'),diagnostic:await identityDiagnostic(getPage(),afm),pendingSession:await saveSession?.()};verified(afm);
  if(service==='business'){
   await follow(getPage,/^(?:Στοιχεία Μητρώου.*|Στοιχεία επιχείρησης|Μητρώο(?:\s*&.*)?)$/i);
   if(!await proof(getPage,afm))return collectionError('source_unknown');
   const result=await capture(afm);if(!/επωνυμ[ίι]α|δραστηρι[όο]τητ|διε[ύυ]θυνση|νομικ[ήη] μορφ[ήη]|[έε]ναρξη/i.test(result.snapshot.text))return collectionError('source_changed');
   result.snapshot.collection={kind:'business',sections:[{title:collectionSources.business,tables:result.snapshot.tables,text:result.snapshot.text}],complete:false};
   result.snapshot.scope='Στοιχεία μητρώου που επέστρεψε η επίσημη υπηρεσία.';delete result.snapshot.image;return {status:'success',...result};
  }
  if(getPage().url()!==landing){await getPage().goto(landing,{waitUntil:'domcontentloaded',timeout:20000});await getPage().waitForTimeout(800);}
  if(service==='vatreturn'){
   const result=await collectVatReturn({getPage,capture,afm,follow,settled,verify:afm=>proof(getPage,afm)});if(result?.needsVerification||result?.status==='needs_verification'){keep=true;return {...collectionError('needs_verification'),pendingSession:await saveSession?.()};}return result||collectionError('source_changed');
  }
  if(service==='efka'){
   const result=await collectIndividualEfka({afm},{getPage,verify:afm=>proof(getPage,afm),capture});if(result.status==='needs_verification')keep=true;return result;
  }
  if(service==='keao')return await collectKeao(afm,{getPage,capture,follow});
  const sections=[];let final=null;
  if(service==='efka'||service==='keao'){
   await getPage().goto('https://services.e-efka.gov.gr/contributions',{waitUntil:'domcontentloaded',timeout:20000});await getPage().waitForTimeout(1800);
   await follow(getPage,service==='keao'?/^(?:ΚΕΑΟ|Κ\.Ε\.Α\.Ο\.|Οφειλές ΚΕΑΟ|Οφειλές)$/i:/^(?:Μη μισθωτ[ώω]ν|Εισφορές μη μισθωτών|Εισφορές)$/i);
  }else if(service==='myaade'){
   if(!Object.values(legacyDebtPaths).includes(new URL(getPage().url()).pathname)){await follow(getPage,/^(?:Οφειλές.*|Στοιχεία Οφειλών.*|Ο Λογαριασμός μου.*)$/i);
   await follow(getPage,/^Οφειλές εκτός ρύθμισης/i);}
  }else{
   await follow(getPage,/^(?:Εφαρμογές|Φορολογικές υπηρεσίες|Δηλώσεις)$/i);
   await follow(getPage,/^(?:Δηλώσεις ΦΠΑ|ΦΠΑ|Δήλωση ΦΠΑ|Δηλώσεις Φ\.Π\.Α\.)$/i);
  }
  const read=async title=>{
   if((await settled(getPage))!=='ready'){keep=true;return false;}
   const result=await capture(afm),data=financialRows(result.snapshot);
   const headings=await getPage().locator('h1,h2,h3,h4,[role=heading]').allTextContents();
   const pattern=service==='myaade'?/οφειλ|debt/i:service==='vatreturn'?/φπα|φ\.π\.α|vat/i:service==='keao'?/κεαο|κ\.ε\.α\.ο/i:/εισφορ.*μη μισθωτ|μη μισθωτ/i;
   const sourceUrl=new URL(result.snapshot.source),knownLegacy=service==='myaade'&&sourceUrl.origin==='https://www1.aade.gr'&&Object.values(legacyDebtPaths).includes(sourceUrl.pathname);
   if(!knownLegacy&&!headings.some(h=>pattern.test(h))&&!pattern.test(result.snapshot.source)&&!data?.apiData.length)return false;
   // Only retain financial responses for the selected service, never a neighbouring source.
   if(data){data.apiData=data.apiData.filter(r=>service==='keao'?r.source.includes('/contributions/keao'):service==='efka'?r.source.endsWith('/contributions/idika'):false);if(!data.tables.length&&!data.apiData.length&&!data.empty)return false;sections.push({title,source:result.snapshot.source,...data});final=result;return true;}return false;
  };
  const readPages=async title=>{const seen=new Set();for(let n=0;n<20;n++){const p=getPage(),signature=await p.locator('table,[role=grid]').allTextContents();const key=JSON.stringify(signature);if(seen.has(key))throw Error('Pagination loop');seen.add(key);const tooMany=await p.locator('table').evaluateAll(tables=>tables.some(t=>!t.querySelector('table')&&t.rows.length>100));if(tooMany)throw Error('Oversized table');await read(title+(n?' · Σελίδα '+(n+1):''));const next=p.getByRole('button',{name:/^(?:Επόμενη(?: σελίδα)?|Next(?: page)?)$/i}).or(p.locator('a[rel=next]:visible'));if(await next.count()!==1||!await next.isEnabled()||await next.getAttribute('aria-disabled')==='true')return;await next.click({timeout:5000,noWaitAfter:true});await getPage().waitForTimeout(1000);}throw Error('Pagination limit');};
  await readPages(collectionSources[service]);
  if(service==='myaade'&&(await openLegacyDebtView(getPage,'arranged')||await follow(getPage,/^Οφειλές σε ρύθμιση/i)))await readPages('Οφειλές σε ρύθμιση');
  if(service==='keao'&&await follow(getPage,/^(?:Ρυθμίσεις|Δόσεις ρύθμισης)$/i))await readPages('Δόσεις ΚΕΑΟ');
  if(keep)return collectionError('needs_verification');
  if(!sections.length)return collectionError('source_changed');
  final.snapshot.collection={kind:service,sections,complete:false};delete final.snapshot.image;final.snapshot.tables=sections.flatMap(s=>s.tables);final.snapshot.apiData=sections.flatMap(s=>s.apiData);final.snapshot.scope='Αυτόματη λήψη από τις αναγνωρισμένες ενότητες. Δεν έχει επιβεβαιωθεί πλήρης κάλυψη σελίδων/οφειλών.';
  return {status:'success',...final};
 }catch{return collectionError('upstream');}finally{input.password=null;input.username=null;if(!keep)await close();}
}
