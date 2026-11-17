// Read-only individual contributions view. The caller owns authentication and session lifecycle.
const origin='https://services.e-efka.gov.gr';
const endpoint='/ssp.api.frontend/contributions/idika';
const view=origin+'/contributions';
const fold=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
const failure=(code,message,status='error')=>({status,code,message});

// Only the public application response's documented-by-observation outer shape is assumed.
// Amounts and rows are preserved verbatim; the summary is never added to the rows.
export function normalizeIndividualContributions(records,notBefore=0){
 const matches=(Array.isArray(records)?records:[]).filter(record=>{
  try{const u=new URL(record.source);return u.origin===origin&&u.pathname===endpoint&&(!notBefore||(Number.isFinite(Date.parse(record.fetchedAt))&&Date.parse(record.fetchedAt)>=notBefore));}catch{return false;}
 });
 const record=matches.at(-1),data=record?.data;
 if(!data||typeof data!=='object'||Array.isArray(data)||data.error||!Array.isArray(data.contributions)||!Object.hasOwn(data,'sumTotalAmounts'))return null;
 const total=data.sumTotalAmounts,validTotal=typeof total==='number'?Number.isFinite(total):typeof total==='string'&&/^-?[0-9\s.,]+(?:\s*€)?$/.test(total.trim());
 if(!validTotal||!data.contributions.every(row=>row&&typeof row==='object'&&!Array.isArray(row)))return null;
 if(!data.contributions.length&&!(typeof total==='number'?total===0:/^0+(?:[.,]0+)?(?:\s*€)?$/.test(total.trim())))return null;
 return {source:origin+endpoint,fetchedAt:record.fetchedAt,data:{sumTotalAmounts:data.sumTotalAmounts,contributions:data.contributions},state:data.contributions.length?'available':'empty'};
}

export function individualGate(text){
 const value=fold(text);
 if(/captcha|recaptcha|κωδικ(ος|ο) επιβεβαιωσησ|one.time (?:code|password)|επαληθευση δυο παραγοντων/.test(value))return 'verification';
 if(/(?:απαιτειται|απαιτουνται|παρακαλω|πρεπει|δωστε|δωσετε|επιλεξτε|χρειαζεται).{0,100}(?:συναινεση|συγκαταθεση|αποδοχη.{0,30}ορων)|(?:συναινεση|συγκαταθεση|αποδοχη.{0,30}ορων).{0,100}(?:απαιτειται|απαιτουνται|για να συνεχισετε|για τη συνεχεια)/.test(value))return 'consent';
 if(/επιλογη (?:ιδιοτητασ|ρολου|προφιλ)|επιλεξτε (?:ιδιοτητα|ρολο|προφιλ)/.test(value))return 'role';
 return null;
}

// Call only after login. verify(afm) must prove the official account identity, not
// merely the existence of a session; capture is the worker's existing capture callback.
export async function collectIndividualEfka({afm},{getPage,verify,capture}){
 if(!/^\d{9}$/.test(afm)||typeof verify!=='function')throw Error('Invalid individual EFKA request');
 try{
  let p=getPage();
  if(!p||new URL(p.url()).origin!==origin)return failure('source_changed','Δεν αναγνωρίστηκε η επίσημη υπηρεσία e-ΕΦΚΑ.');
  if(!await verify(afm))return failure('identity_unverified','Δεν επιβεβαιώθηκε το ΑΦΜ στην επίσημη υπηρεσία.');
  const gate=async()=>individualGate(await getPage().locator('body').innerText().catch(()=>''));
  const checkGate=async()=>{const reason=await gate();return reason?{...failure('needs_verification','Η επίσημη υπηρεσία απαιτεί ενέργεια από εσένα για να συνεχιστεί η λήψη.','needs_verification'),reason}:null;};
  let blocked=await checkGate();if(blocked)return blocked;
  const start=Date.now();
  await p.goto(view,{waitUntil:'domcontentloaded',timeout:20000});
  for(let attempt=0;attempt<8;attempt++){
   p=getPage();if(!p||new URL(p.url()).origin!==origin)return failure('needs_verification','Η επίσημη υπηρεσία απαιτεί ενέργεια από εσένα για να συνεχιστεί η λήψη.','needs_verification');
   blocked=await checkGate();if(blocked)return blocked;
   if(!await verify(afm))return failure('identity_unverified','Δεν επιβεβαιώθηκε το ΑΦΜ στην επίσημη υπηρεσία.');
   let result;try{result=await capture(afm);}catch{if(attempt<7)await p.waitForTimeout(750);continue;}
   const record=normalizeIndividualContributions(result.snapshot?.apiData,start);
   if(record){
    const section={title:'Εισφορές μη μισθωτών',source:record.source,tables:[],empty:record.state==='empty',apiData:[{source:record.source,fetchedAt:record.fetchedAt,data:record.data}]};
    // Exclude screenshots, page text, documents and unrelated financial responses.
    const snapshot={service:'efka',afm,source:origin+'/contributions',capturedAt:result.snapshot.capturedAt,tables:[],apiData:section.apiData,collection:{kind:'efka',sections:[section],complete:false,availability:record.state,applicability:'individual'},scope:'Εισφορές φυσικού προσώπου όπως επιστράφηκαν από τον e-ΕΦΚΑ. Δεν περιλαμβάνονται εργοδοτικές εισφορές εταιρείας ή επιβεβαίωση πλήρους κάλυψης.'};
    return {status:'success',snapshot,saved:result.saved};
   }
   if(attempt<7)await p.waitForTimeout(750);
  }
  return failure('source_unknown','Δεν επιβεβαιώθηκαν διαθέσιμα στοιχεία εισφορών ή η επιλεξιμότητα του λογαριασμού. Τα προηγούμενα στοιχεία διατηρήθηκαν.');
 }catch{return failure('upstream','Η επίσημη υπηρεσία δεν ανταποκρίθηκε. Τα προηγούμενα στοιχεία διατηρήθηκαν.');}
}
