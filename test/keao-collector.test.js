import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeKeaoRecords,collectKeao} from '../portal-worker/keao-collector.js';
const base='https://services.e-efka.gov.gr/ssp.api.frontend/contributions/keao';
const record=(source,data)=>({source,data,fetchedAt:'2026-01-01T00:00:00.000Z'});
const summary=(overrides={})=>({totalSum:'0',sumSettled:'0',sumUnsettled:'0',settledDebtsList:[],unsettledDebtsList:[],...overrides});
test('normalizes separately without adding overlapping amounts',()=>{
 const data=summary({totalSum:'120,00',sumSettled:'120,00',settledDebtsList:[{amount:'120,00'}]});
 const n=normalizeKeaoRecords([record(base,data),record(base+'/installments',[{amount:'120,00'}]),record(base+'/debts',[{amount:'120,00'}])]);
 assert.equal(n.summary.status,'available');assert.deepEqual(n.summary.data,data);assert.equal(n.installments.status,'unknown');assert.deepEqual(n.installments.data,[{amount:'120,00'}]);assert.equal(n.debts.source,base+'/debts');assert.equal(n.summary.fetchedAt,'2026-01-01T00:00:00.000Z');
});
test('empty needs explicit zeros; missing, malformed and unrelated data stay unknown',()=>{
 assert.equal(normalizeKeaoRecords([record(base,summary())]).summary.status,'empty');
 for(const value of [summary({totalSum:''}),summary({totalSum:'9'}),{},null,{error:'failure'}])assert.equal(normalizeKeaoRecords([record(base,value)]).summary.status,'unknown');
 assert.equal(normalizeKeaoRecords([record(base+'?other=1',summary())]).summary.status,'unknown');
 assert.equal(normalizeKeaoRecords([record('https://evil.example/ssp.api.frontend/contributions/keao',summary())]).summary.status,'unknown');
});
test('collector uses read view and retains only KEAO source data',async()=>{
 const visits=[],page={url:()=> 'https://services.e-efka.gov.gr/',goto:async u=>visits.push(u),waitForTimeout:async()=>{}};
 const snapshot={source:'https://services.e-efka.gov.gr/contributions',text:'unrelated',tables:[['x']],image:'secret',document:{},apiData:[{...record(base,summary()),fetchedAt:new Date(Date.now()+1000).toISOString()},{...record(base+'/installments',[{amount:'1'}]),fetchedAt:new Date(Date.now()+1000).toISOString()},record('https://services.e-efka.gov.gr/ssp.api.frontend/contributions/idika',{})]};
 const result=await collectKeao('123456789',{getPage:()=>page,capture:async()=>({snapshot,saved:{}}),follow:async()=>true});
 assert.equal(result.status,'success');assert.deepEqual(visits,['https://services.e-efka.gov.gr/contributions']);assert.equal(result.snapshot.collection.keao.summary.status,'empty');assert.equal(result.snapshot.apiData.length,2);assert.equal(result.snapshot.image,undefined);assert.equal(result.snapshot.text,'');assert.match(result.snapshot.scope,/εργοδότη/);
});
test('unknown and capture failures do not produce success',async()=>{
 const page={url:()=> 'https://services.e-efka.gov.gr/',goto:async()=>{},waitForTimeout:async()=>{}};
 const helpers={getPage:()=>page,capture:async()=>({snapshot:{source:'https://services.e-efka.gov.gr/contributions',apiData:[record(base,summary({totalSum:''}))]}})};
 assert.equal((await collectKeao('123456789',helpers)).code,'source_changed');
 helpers.capture=async()=>{throw Error('failure')};assert.equal((await collectKeao('123456789',helpers)).code,'upstream');
});

test('stale summary is rejected and loading capture is retried',async()=>{
 const page={url:()=> 'https://services.e-efka.gov.gr/',goto:async()=>{},waitForTimeout:async()=>{}};
 let attempts=0;
 const helpers={getPage:()=>page,capture:async()=>{attempts++;if(attempts===1)throw Error('loading');return {snapshot:{source:'https://services.e-efka.gov.gr/contributions',apiData:[record(base,summary())]}}}};
 assert.equal((await collectKeao('123456789',helpers)).code,'source_changed');assert.equal(attempts,2);
});

test('corporate collector requires selected registry and matching identity',async()=>{
 const {collectCorporateKeao}=await import('../portal-worker/keao-collector.js');
 const url='https://services.e-efka.gov.gr/ssp.efka.keao/views/eDebtorCM/mainCM.xhtml';
 let body='Επιλογή Μητρώου Οφειλέτη',verified=false,captures=0;
 const page={url:()=>url,locator:()=>({innerText:async()=>body}),getByRole:()=>({count:async()=>0})};
 const helpers={getPage:()=>page,verify:async()=>verified,capture:async()=>{captures++;return {snapshot:{source:url,text:'Ενεργές Οφειλές',tables:[[['Έτος','Κύρια Εισφορά','Σύνολο'],['2025','10','10']]]}}}};
 assert.equal((await collectCorporateKeao('123456789',helpers)).status,'needs_verification');
 body='Επιλεγμένος οφειλέτης';assert.equal((await collectCorporateKeao('123456789',helpers)).code,'identity_unverified');assert.equal(captures,0);
 verified=true;const result=await collectCorporateKeao('123456789',helpers);assert.equal(result.status,'success');assert.equal(result.snapshot.tables[0][1][2],'10');assert.match(result.snapshot.scope,/επιλεγμένο μητρώο/);
});
test('corporate collector rejects unrecognized tables and wrong source',async()=>{
 const {collectCorporateKeao}=await import('../portal-worker/keao-collector.js');
 let url='https://services.e-efka.gov.gr/ssp.efka.keao/views/eDebtorCM/mainCM.xhtml';
 const page={url:()=>url,locator:()=>({innerText:async()=>''}),getByRole:()=>({count:async()=>0})};
 const helpers={getPage:()=>page,verify:async()=>true,capture:async()=>({snapshot:{source:url,text:'Ενεργές Οφειλές',tables:[]}})};
 assert.equal((await collectCorporateKeao('123456789',helpers)).code,'source_changed');url='https://services.e-efka.gov.gr/contributions';assert.equal((await collectCorporateKeao('123456789',helpers)).code,'source_changed');
});
