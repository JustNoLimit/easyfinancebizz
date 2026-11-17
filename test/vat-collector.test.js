import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseVatSnapshot,collectVatReturn,yearlyVatUrl} from '../portal-worker/vat-collector.js';
const source='https://www1.aade.gr/returns';
test('retains only recognizable filed VAT return rows without inferring balances',()=>{
 const rows=[['Περίοδος','Ημερομηνία υποβολής','Χρεωστικό ποσό','Πιστωτικό ποσό'],['01/2025','20/02/2025','1.200,50','']];
 assert.deepEqual(parseVatSnapshot({source,tables:[rows]}),{tables:[rows],empty:false,apiData:[],balances:'unknown'});
});
test('rejects unrelated tables and nonofficial sources',()=>{
 const rows=[['Περίοδος','Ποσό'],['01/2025','100']];
 assert.equal(parseVatSnapshot({source,tables:[rows]}),null);
 assert.equal(parseVatSnapshot({source:'https://evil.example',tables:[rows]}),null);
});
test('recognizes explicit VAT empty results but not conditional guidance',()=>{
 assert.equal(parseVatSnapshot({source,text:'Δεν βρέθηκαν δηλώσεις ΦΠΑ'}).empty,true);
 assert.equal(parseVatSnapshot({source,text:'Εάν δεν βρέθηκαν δηλώσεις ΦΠΑ επικοινωνήστε μαζί μας'}),null);
});
test('does not accept a VAT-looking table without VAT page identity',async()=>{
 const snapshot={source,tables:[[['Περίοδος','Ημερομηνία υποβολής','Χρεωστικό ποσό'],['2025','1/2/2025','4']]]};
 const page={url:()=>source,goto:async()=>{},waitForTimeout:async()=>{},locator:selector=>selector === 'form' ? {evaluateAll:async()=>[]} : {allTextContents:async()=>['Οφειλές']}};
 const output=await collectVatReturn({getPage:()=>page,capture:async()=>({snapshot}),afm:'123456789',follow:async()=>false});
 assert.equal(output,null);
});

test('yearly URL uses only the exact GET endpoint and preserves fields',()=>{
 const base='https://www1.aade.gr/taxisnet/vat/protected/displayDeclarationTypes.htm';
 const f={name:'gotovatF2',action:'/taxisnet/vat/protected/displayLiabilitiesForYear.htm',method:'get',label:'ΦΠΑ VIES ετήσια',fields:[{name:'declarationType',value:'vatF2'},{name:'year',value:'2025'},{name:'typeBtn',value:'F2'}]};
 const u=new URL(yearlyVatUrl(f,base,2026));
 assert.equal(u.searchParams.get('year'),'2025'); assert.equal(u.searchParams.get('typeBtn'),'F2');
 assert.equal(yearlyVatUrl({...f,method:'post'},base,2026),null);
 assert.equal(yearlyVatUrl({...f,action:'/taxisnet/vat/protected/submit-flow.htm'},base,2026),null);
 assert.equal(yearlyVatUrl({...f,action:'https://evil.example/taxisnet/vat/protected/displayLiabilitiesForYear.htm'},base,2026),null);
 assert.equal(yearlyVatUrl({...f,name:'gotovatF4'},base,2026),null);
 assert.equal(yearlyVatUrl({...f,fields:[{name:'declarationType',value:'vatF4'},{name:'year',value:'2025'}]},base,2026),null);
});
test('return listing without monetary column has unknown balances',()=>{
 const rows=[['Περίοδος','Κατάσταση δήλωσης'],['01/2025','Υποβληθείσα']];
 assert.equal(parseVatSnapshot({source,tables:[rows]}).balances,'unknown');
});
test('collector passes expected AFM to capture',async()=>{
 let captured; const page={url:()=>source,goto:async()=>{},waitForTimeout:async()=>{},locator:selector=>selector==='form'?{evaluateAll:async()=>[]}:{allTextContents:async()=>['ΦΠΑ']}};
 await collectVatReturn({getPage:()=>page,capture:async afm=>{captured=afm;return {snapshot:{source,tables:[]}}},afm:'123456789',follow:async()=>false});
 assert.equal(captured,'123456789');
});

test('selects only F2 among forms sharing the same broad label',()=>{
 const base='https://www1.aade.gr/taxisnet/vat/protected/displayDeclarationTypes.htm';
 const forms=['F1','F2','F4','F5','Charter'].map(kind=>({name:'gotovat'+kind,action:'/taxisnet/vat/protected/displayLiabilitiesForYear.htm',method:'get',label:'Περιοδικές ΦΠΑ VIES ετήσια',fields:[{name:'declarationType',value:'vat'+kind},{name:'year',value:'2025'},{name:'typeBtn',value:'display'}]}));
 const matches=forms.map(f=>yearlyVatUrl(f,base,2026)).filter(Boolean);
 assert.equal(matches.length,1);
 assert.equal(new URL(matches[0]).searchParams.get('declarationType'),'vatF2');
});
