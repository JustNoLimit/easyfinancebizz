import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIndividualContributions,individualGate,collectIndividualEfka} from '../portal-worker/efka-collector.js';
const source='https://services.e-efka.gov.gr/ssp.api.frontend/contributions/idika';
const record=data=>({source,fetchedAt:new Date().toISOString(),data});
test('preserves source amounts and rows without adding totals',()=>{
 const data={sumTotalAmounts:'1.234,50',contributions:[{amount:'1.234,50',period:'2024'}]};
 assert.deepEqual(normalizeIndividualContributions([record(data)]).data,data);
});
test('only a recognized response can establish an empty result',()=>{
 assert.equal(normalizeIndividualContributions([record({sumTotalAmounts:'0',contributions:[]})]).state,'empty');
 assert.equal(normalizeIndividualContributions([record({contributions:[]})]),null);
 assert.equal(normalizeIndividualContributions([record({sumTotalAmounts:'100',contributions:[]})]),null);assert.equal(normalizeIndividualContributions([record({sumTotalAmounts:'',contributions:[]})]),null);
 assert.equal(normalizeIndividualContributions([{...record({sumTotalAmounts:0,contributions:[]}),source:'https://other.example/ssp.api.frontend/contributions/idika'}]),null);
 assert.equal(normalizeIndividualContributions([record({sumTotalAmounts:0,contributions:[]})],Date.now()+10000),null);
});
test('recognizes user-controlled gates',()=>{
 assert.equal(individualGate('Επιλέξτε ρόλο'), 'role');assert.equal(individualGate('Απαιτείται συγκατάθεση για να συνεχίσετε'), 'consent');assert.equal(individualGate('Επικοινωνία | Όροι χρήσης | Πολιτική απορρήτου'), null);assert.equal(individualGate('CAPTCHA'), 'verification');
});
test('collector returns a fresh response without unrelated snapshot data',async()=>{
 const page={url:()=> 'https://services.e-efka.gov.gr/',locator:()=>({innerText:async()=>''}),goto:async()=>{},waitForTimeout:async()=>{}};
 const out=await collectIndividualEfka({afm:'123456789'},{getPage:()=>page,verify:async()=>true,capture:async()=>({snapshot:{capturedAt:'now',text:'private',image:'private',apiData:[record({sumTotalAmounts:'0',contributions:[]})]},saved:{}})});
 assert.equal(out.status,'success');assert.equal(out.snapshot.collection.availability,'empty');assert.equal(out.snapshot.text,undefined);assert.equal(out.snapshot.image,undefined);
});
test('does not navigate when a role selection or identity proof is required',async()=>{
 let navigations=0;const page={url:()=> 'https://services.e-efka.gov.gr/',locator:()=>({innerText:async()=> 'Επιλέξτε ρόλο'}),goto:async()=>{navigations++;}};
 const opts={getPage:()=>page,verify:async()=>true,capture:async()=>{throw Error('unexpected');}};
 assert.equal((await collectIndividualEfka({afm:'123456789'},opts)).reason,'role');assert.equal(navigations,0);
 opts.verify=async()=>false;assert.equal((await collectIndividualEfka({afm:'123456789'},opts)).code,'identity_unverified');assert.equal(navigations,0);
});

test('retries transient capture failures within the bounded poll',async()=>{
 let attempts=0;const page={url:()=> 'https://services.e-efka.gov.gr/',locator:()=>({innerText:async()=>''}),goto:async()=>{},waitForTimeout:async()=>{}};
 const out=await collectIndividualEfka({afm:'123456789'},{getPage:()=>page,verify:async()=>true,capture:async()=>{if(++attempts===1)throw Error('loading');return {snapshot:{apiData:[record({sumTotalAmounts:'0',contributions:[]})]}};}});
 assert.equal(out.status,'success');assert.equal(attempts,2);
});
