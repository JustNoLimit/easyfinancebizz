import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyEmployerLanding,collectEmployerFinancialCard,employerFinancialCardUrl,normalizeEmployerFinancialTables} from '../portal-worker/employer-collector.js';
const head=['Ημ/νία Κίνησης','Τύπος Κίνησης','Παραστατικό','Περίοδος','Χρέωση','Πίστωση','Υπόλοιπο Κινήσεων','Ενέργειες'];
const row=['1/1/2026','ΑΠΔ','123','1/2026','100,00','0,00','-100,00',''];
test('accepts only documented landing and recognizes authentication fallback',()=>{
 assert.equal(classifyEmployerLanding(employerFinancialCardUrl),'financial_card');
 assert.equal(classifyEmployerLanding('https://services.e-efka.gov.gr/ssp.commonservices.home/views/secure/index.xhtml'),'verification');
 assert.equal(classifyEmployerLanding('https://services.e-efka.gov.gr/ssp.efka.emp-transactions-ext/payment'),'unknown');
 assert.equal(classifyEmployerLanding('https://other.example/ssp.efka.emp-transactions-ext/'),'unknown');
});
test('requires financial headings and rows or an explicit empty marker',()=>{
 assert.deepEqual(normalizeEmployerFinancialTables([[head,row]]),{tables:[[head,row]],empty:false});
 assert.equal(normalizeEmployerFinancialTables([[head,['Δεν υπάρχουν εγγραφές']]]).empty,true);
 assert.equal(normalizeEmployerFinancialTables([[head]]),null);
 assert.equal(normalizeEmployerFinancialTables([[['Χρέωση','Πίστωση'],['1','2']]]),null);
});
test('verifies identity, navigates to exact route and keeps only financial data',async()=>{
 let url='https://services.e-efka.gov.gr/';let checks=0;const page={url:()=>url,goto:async u=>{url=u;},locator:()=>({innerText:async()=>''}),waitForTimeout:async()=>{}};
 const result=await collectEmployerFinancialCard({afm:'123456789'},{getPage:()=>page,verify:async()=>{checks++;return true;},capture:async()=>({snapshot:{source:url,tables:[[head,row]],text:'private',apiData:[{data:'private'}]}})});
 assert.equal(result.status,'success');assert.equal(url,employerFinancialCardUrl);assert.equal(checks,1);assert.deepEqual(result.snapshot.tables,[[head,row]]);assert.deepEqual(result.snapshot.apiData,[]);assert.equal(result.snapshot.text,undefined);
});
test('does not mistake a redirect or unknown content for zero',async()=>{
 let url='https://services.e-efka.gov.gr/';const page={url:()=>url,goto:async()=>{url='https://services.e-efka.gov.gr/ssp.commonservices.home/views/secure/index.xhtml';},locator:()=>({innerText:async()=>''}),waitForTimeout:async()=>{}};
 let options={getPage:()=>page,verify:async()=>true,capture:async()=>{throw Error('must not capture');}};
 assert.equal((await collectEmployerFinancialCard({afm:'123456789'},options)).status,'needs_verification');
 url='https://services.e-efka.gov.gr/';page.goto=async u=>{url=u;};options.capture=async()=>({snapshot:{source:url,tables:[]}});
 assert.equal((await collectEmployerFinancialCard({afm:'123456789'},options)).code,'source_unknown');
});
test('stops before capture for identity failure or user gate',async()=>{
 let navigated=false;let body='';let url='https://services.e-efka.gov.gr/';const page={url:()=>url,goto:async value=>{navigated=true;url=value;},locator:()=>({innerText:async()=>body})};
 const options={getPage:()=>page,verify:async()=>false,capture:async()=>{}};
 assert.equal((await collectEmployerFinancialCard({afm:'123456789'},options)).code,'identity_unverified');
 navigated=false;body='Απαιτείται συγκατάθεση';assert.equal((await collectEmployerFinancialCard({afm:'123456789'},options)).status,'needs_verification');assert.equal(navigated,false);
});
