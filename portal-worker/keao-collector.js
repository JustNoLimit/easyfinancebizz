// Read-only KEAO dashboard collector. Identity must already have been verified by
// the caller for the requested AFM before this function is invoked.
const origin='https://services.e-efka.gov.gr';
const base=origin+'/ssp.api.frontend/contributions/keao';
const endpoints={summary:base,debts:base+'/debts',installments:base+'/installments'};
const scope='Στοιχεία ΚΕΑΟ που επέστρεψε ο πίνακας ασφαλισμένου e-ΕΦΚΑ. Δεν έχει επιβεβαιωθεί κάλυψη εργοδότη ή όλων των ρόλων ΑΜΚΑ, ΑΜΕ και ΑΜΟΕ.';
const error=(code,message)=>({status:'error',code,message});
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const isAmount=value=>typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value.trim()!=='';
const zero=value=>typeof value==='number'?value===0:typeof value==='string'&&/^\s*0+(?:[.,]0+)?\s*$/.test(value);
function statusSummary(data){
 if(!isObject(data)||data.error||!Array.isArray(data.settledDebtsList)||!Array.isArray(data.unsettledDebtsList))return 'unknown';
 if(data.settledDebtsList.length||data.unsettledDebtsList.length)return 'available';
 // An empty list alone cannot establish a zero balance or employer coverage.
 const amounts=[data.totalSum,data.sumSettled,data.sumUnsettled];
 return amounts.every(isAmount)&&amounts.every(zero)?'empty':'unknown';
}
function sourceKind(source){
 try{const u=new URL(source);if(u.origin!==origin||u.search||u.hash)return null;return Object.keys(endpoints).find(k=>endpoints[k]===u.href)||null;}catch{return null;}
}
// Preserve values verbatim: details and summary can overlap and must never be summed.
export function normalizeKeaoRecords(records){
 const result={summary:{status:'unknown'},debts:{status:'unknown'},installments:{status:'unknown'}};
 for(const record of Array.isArray(records)?records:[]){
  const kind=sourceKind(record?.source);if(!kind)continue;
  const data=record.data;
  if(kind==='summary'){
   const state=statusSummary(data);
   // A malformed or incomplete newer response must not turn into a zero result.
   result.summary={status:state,source:record.source,fetchedAt:record.fetchedAt||null,...(state==='unknown'?{}:{data})};
  }else{
   // The public bundle identifies these endpoints but does not establish their
   // response schema. Preserve successful payloads without inventing a meaning.
   const valid=Array.isArray(data)||isObject(data)&&!data.error;
   result[kind]={status:'unknown',source:record.source,fetchedAt:record.fetchedAt||null,...(valid?{data}:{})};
  }
 }
 return result;
}

// capture(afm) is the existing worker capture; follow is its safe read-control
// helper. No direct API calls, form submissions or settlement/payment actions.
export async function collectKeao(afm,{getPage,capture,follow}){
 try{
  const p=getPage();
  if(!p||new URL(p.url()).origin!==origin)return error('source_changed','Η ενότητα ΚΕΑΟ δεν αναγνωρίστηκε στην επίσημη υπηρεσία.');
  const navigationStarted=Date.now();
  await p.goto(origin+'/contributions',{waitUntil:'domcontentloaded',timeout:20000});
  await getPage().waitForTimeout(1800);
  if(follow)await follow(getPage,/^(?:ΚΕΑΟ|Κ\.Ε\.Α\.Ο\.|Οφειλές ΚΕΑΟ)$/i);
  let captured, lastError;
  for(let attempt=0;attempt<3;attempt++){
   try{captured=await capture(afm);break;}catch(err){lastError=err;if(attempt<2)await getPage().waitForTimeout(1000);}
  }
  if(!captured)throw lastError||Error('Capture failed');
  const snapshot=captured.snapshot;
  if(!snapshot||new URL(snapshot.source).origin!==origin)return error('source_changed','Η ενότητα ΚΕΑΟ δεν αναγνωρίστηκε στην επίσημη υπηρεσία.');
  const records=(snapshot.apiData||[]).filter(r=>sourceKind(r?.source)&&Number.isFinite(Date.parse(r.fetchedAt))&&Date.parse(r.fetchedAt)>=navigationStarted);
  const normalized=normalizeKeaoRecords(records);
  if(normalized.summary.status==='unknown')return error('source_changed','Δεν αναγνωρίστηκαν επαρκή στοιχεία ΚΕΑΟ. Τα προηγούμενα στοιχεία διατηρήθηκαν.');
  snapshot.collection={kind:'keao',sections:[{title:'ΚΕΑΟ',source:normalized.summary.source,tables:[],empty:normalized.summary.status==='empty',apiData:records}],complete:false,keao:normalized};
  snapshot.scope=scope;
  snapshot.apiData=records;
  snapshot.tables=[];
  snapshot.text='';
  delete snapshot.image;
  delete snapshot.document;
  return {status:'success',...captured};
 }catch{return error('upstream','Η επίσημη υπηρεσία δεν ανταποκρίθηκε. Τα προηγούμενα στοιχεία διατηρήθηκαν.');}
}

const corporatePath='/ssp.efka.keao/views/eDebtorCM/mainCM.xhtml';
const corporateScope='Στοιχεία μόνο για το επιλεγμένο μητρώο οφειλέτη ΚΕΑΟ. Άλλα μητρώα και εργοδοτικές οφειλές ενδέχεται να μην περιλαμβάνονται.';
const folded=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/g,' ').trim();
function corporateLocation(url){try{const u=new URL(url);return u.origin===origin&&u.pathname===corporatePath;}catch{return false;}}
function registrySelection(text){return /επιλογη μητρωου οφειλετη|μητρωα οφειλετη/i.test(folded(text));}
function corporateTables(snapshot){
 const text=folded(snapshot.text),tables=Array.isArray(snapshot.tables)?snapshot.tables:[];
 const debt=/ενεργες οφειλες|πινακας χρεων οφειλετη/i.test(text);
 const arrangements=/ενεργες ρυθμισεις|στοιχεια ρυθμισεων|πινακας ρυθμισεων/i.test(text);
 if(!debt&&!arrangements)return null;
 const recognized=tables.filter(t=>Array.isArray(t)&&t.length>1&&t.every(r=>Array.isArray(r)&&r.every(c=>typeof c==='string'))&&t[0].some(c=>/εισφορα|προσθετα τελη|συνολο|ποσο|οφειλ|δοσ|ρυθμισ/i.test(folded(c)))&&t.slice(1).every(row=>row.length===t[0].length&&row.some(cell=>/\d/.test(cell))));
 // A blank or unrecognized table does not prove absence of debts.
 if(!recognized.length)return null;
 return {title:debt?'Ενεργές οφειλές':'Στοιχεία ρυθμίσεων',source:snapshot.source,tables:recognized,empty:false,apiData:[]};
}
// verify(page, afm) must establish the AFM of the *selected* debtor, not
// merely an AFM somewhere in a registry-selection table. Registry selection is
// always left to the owner; no choices or financial operations are submitted.
export async function collectCorporateKeao(afm,{getPage,verify,capture}){
 try{
  const page=getPage();
  if(!/^\d{9}$/.test(afm)||!page||!corporateLocation(page.url()))return error('source_changed','Η επίσημη υπηρεσία οφειλετών ΚΕΑΟ δεν αναγνωρίστηκε.');
  const text=await page.locator('body').innerText({timeout:5000});
  if(registrySelection(text))return {status:'needs_verification',code:'needs_verification',message:'Επίλεξε το μητρώο οφειλέτη στην επίσημη υπηρεσία για να συνεχιστεί η λήψη.'};
  if(!await verify(page,afm))return error('identity_unverified','Δεν επιβεβαιώθηκε το ΑΦΜ του επιλεγμένου οφειλέτη.');
  // Only an exact active-debts navigation label is eligible. Never choose a
  // registry or any payment, calculation, application, or submission control.
  const link=page.getByRole('link',{name:/^Ενεργές Οφειλές$/i,exact:true});
  if(await link.count()===1&&await link.isVisible()&&await link.isEnabled()){
   const href=await link.getAttribute('href');
   if(!href||href.startsWith('#')||/^javascript:/i.test(href)||corporateLocation(new URL(href,page.url()).href)){
    await link.click({timeout:5000,noWaitAfter:true});await getPage().waitForTimeout(1000);
   }
  }
  const current=getPage();
  if(!current||!corporateLocation(current.url())||!await verify(current,afm))return error('identity_unverified','Δεν επιβεβαιώθηκε το ΑΦΜ του επιλεγμένου οφειλέτη.');
  const captured=await capture(afm),snapshot=captured?.snapshot;
  if(!snapshot||!corporateLocation(snapshot.source))return error('source_changed','Η επίσημη υπηρεσία οφειλετών ΚΕΑΟ δεν αναγνωρίστηκε.');
  const section=corporateTables(snapshot);
  if(!section)return error('source_changed','Δεν αναγνωρίστηκαν στοιχεία οφειλών για το επιλεγμένο μητρώο. Τα προηγούμενα στοιχεία διατηρήθηκαν.');
  snapshot.collection={kind:'keao',sections:[section],complete:false};snapshot.tables=section.tables;snapshot.apiData=[];snapshot.scope=corporateScope;
  delete snapshot.image;delete snapshot.document;
  return {status:'success',...captured};
 }catch{return error('upstream','Η επίσημη υπηρεσία δεν ανταποκρίθηκε. Τα προηγούμενα στοιχεία διατηρήθηκαν.');}
}
