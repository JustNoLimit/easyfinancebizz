// Read-only employer financial card. Authentication and session lifecycle belong to the caller.
import {individualGate} from './efka-collector.js';
const origin='https://services.e-efka.gov.gr';
const path='/ssp.efka.emp-transactions-ext/';
export const employerFinancialCardUrl=origin+path;
const fold=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/ς/g,'σ').replace(/\s+/g,' ').trim();
const fail=(code,message,status='error')=>({status,code,message});
const verification=reason=>({...fail('needs_verification','Η επίσημη υπηρεσία απαιτεί ενέργεια από εσένα για να συνεχιστεί η λήψη.','needs_verification'),reason});

// Only the official documented entry point has been verified publicly. An unknown
// post-login path is deliberately not assumed to be the financial card.
export function classifyEmployerLanding(value){
 try{
  const u=new URL(value);
  if(u.origin===origin && (u.pathname===path||u.pathname===path.slice(0,-1)) && !u.search && !u.hash)return 'financial_card';
  if(/(?:^|\.)(?:gsis\.gr|aade\.gr)$/.test(u.hostname)||u.origin===origin&&(/login|oauth|openid|commonservices\.home/i.test(u.pathname)))return 'verification';
 }catch{}
 return 'unknown';
}

// Headings from the official financial-card manual. Preserve rows, including
// debit and credit, as received; do not infer balance or coverage from them.
export function normalizeEmployerFinancialTables(tables){
 const out=[];
 for(const table of Array.isArray(tables)?tables:[]){
  if(!Array.isArray(table)||!table.length||!table.every(r=>Array.isArray(r)&&r.every(c=>typeof c==='string')))continue;
  const h=table[0].map(fold);
  if(!h.some(x=>/ημ.{0,8}νια κινησησ/.test(x))||!h.some(x=>/τυποσ κινησησ/.test(x))||!h.some(x=>/παραστατικο/.test(x))||!h.some(x=>/περιοδοσ/.test(x))||!h.some(x=>/^χρεωση$/.test(x))||!h.some(x=>/^πιστωση$/.test(x)))continue;
  const rows=table.slice(1);
  const empty=rows.length===1&&rows[0].filter(x=>x.trim()).length===1&&rows[0].some(x=>/^(?:δεν υπαρχουν εγγραφεσ|δεν βρεθηκαν εγγραφεσ)\.?$/.test(fold(x)));
  if(empty)return {tables:[table],empty:true};
  if(rows.length&&rows.every(row=>row.length===h.length&&row.some(x=>/\d/.test(x))))out.push(table);
 }
 return out.length?{tables:out,empty:false}:null;
}

// capture and verify are injected by the worker. This function performs only
// navigation and reading; it never clicks search, payment or consent controls.
export async function collectEmployerFinancialCard({afm},{getPage,verify,capture}){
 if(!/^\d{9}$/.test(afm)||typeof verify!=='function')throw Error('Invalid employer EFKA request');
 try{
  let p=getPage();
  if(!p||new URL(p.url()).origin!==origin)return verification('authentication');
  const gate=async()=>individualGate(await getPage().locator('body').innerText().catch(()=>''));
  let blocked=await gate();if(blocked)return verification(blocked);
  await p.goto(employerFinancialCardUrl,{waitUntil:'domcontentloaded',timeout:20000});
  for(let attempt=0;attempt<8;attempt++){
   p=getPage();if(!p)return verification('authentication');
   const landing=classifyEmployerLanding(p.url());
   if(landing==='verification')return verification('authentication');
   if(landing!=='financial_card')return fail('source_unknown','Δεν αναγνωρίστηκε η καρτέλα εργοδότη. Τα προηγούμενα στοιχεία διατηρήθηκαν.');
   blocked=await gate();if(blocked)return verification(blocked);
   if(!await verify(afm))return fail('identity_unverified','Δεν επιβεβαιώθηκε το ΑΦΜ στην επίσημη υπηρεσία.');
   let result;try{result=await capture(afm);}catch{if(attempt<7)await p.waitForTimeout(750);continue;}
   if(classifyEmployerLanding(result?.snapshot?.source)!=='financial_card')return fail('source_unknown','Δεν αναγνωρίστηκε η καρτέλα εργοδότη. Τα προηγούμενα στοιχεία διατηρήθηκαν.');
   const data=normalizeEmployerFinancialTables(result.snapshot.tables);
   if(data){
    const source=result.snapshot.source, section={title:'Οικονομική καρτέλα εργοδότη',source,...data,apiData:[]};
    return {status:'success',snapshot:{service:'employer',afm,source,capturedAt:result.snapshot.capturedAt,tables:data.tables,apiData:[],collection:{kind:'employer',sections:[section],complete:false,availability:data.empty?'empty':'available',applicability:'employer'},scope:'Κινήσεις ασφαλιστικών εισφορών εργοδότη όπως εμφανίζονται στην επίσημη καρτέλα. Δεν έχει επιβεβαιωθεί πλήρης κάλυψη ή εικόνα οφειλών ΚΕΑΟ.'},saved:result.saved};
   }
   if(attempt<7)await p.waitForTimeout(750);
  }
  return fail('source_unknown','Δεν αναγνωρίστηκαν κινήσεις ή ρητή ένδειξη κενών αποτελεσμάτων. Τα προηγούμενα στοιχεία διατηρήθηκαν.');
 }catch{return fail('upstream','Η επίσημη υπηρεσία δεν ανταποκρίθηκε. Τα προηγούμενα στοιχεία διατηρήθηκαν.');}
}
