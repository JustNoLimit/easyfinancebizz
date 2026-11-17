import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.js';
import {openVault} from '../vault.js';
import {financialRows,identityMatches,recognizedFinancial} from '../portal-worker/collect.js';
const afm='094259216',password='fixture TAXISNET secret';
async function harness(callback,worker){
 const directory=mkdtempSync(join(tmpdir(),'ef-taxisnet-'));const server=createApp({directory,origin:'http://test',portalClient:{available:true,call:worker}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let cookie='',csrf='';
 async function request(path,method='GET',data,extra={}){const r=await fetch(`http://127.0.0.1:${server.address().port}`+path,{method,headers:{Origin:'http://test','Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,...extra},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json(),headers:r.headers};}
 try{assert.equal((await request('/api/taxisnet')).status,401);const setup=await request('/api/setup','POST',{token:readFileSync(join(directory,'setup-token'),'utf8'),username:'owner',password:'strong app fixture password'});cookie=setup.headers.get('set-cookie').split(';')[0];csrf=setup.data.csrf;await request('/api/services/business','POST',{afm});await callback({request,directory});}finally{await new Promise(r=>server.close(r));rmSync(directory,{recursive:true,force:true});}
}
const result=service=>({status:'success',snapshot:{service,afm,capturedAt:'2026-11-17T12:00:00Z',source:'https://www1.aade.gr/',scope:'Fixture',collection:{kind:service,sections:[{title:'Fixture',tables:[[['Amount'],['25.00']]]}]},document:null},saved:{url:'https://www1.aade.gr/',storage:{cookies:[{value:'PRIVATE_COOKIE'}]}}});
async function finished(request){for(let i=0;i<100;i++){const value=(await request('/api/taxisnet')).data;if(value.job?.status!=='running')return value;await new Promise(r=>setTimeout(r,5));}throw Error('Job did not finish');}
test('encrypted client credentials, async collection, source failures, secret redaction, revocation and CSRF',async()=>{
 const calls=[];let fail=false;await harness(async({request,directory})=>{
  assert.equal((await request('/api/taxisnet/credentials','POST',{username:'normal-user',password},{'X-CSRF-Token':'bad'})).status,403);
  const sealed=await request('/api/taxisnet/credentials','POST',{username:'normal-user',password});assert.equal(sealed.status,200);assert.ok(!JSON.stringify(sealed.data).includes(password));const token=sealed.data.token;
  assert.equal((await request('/api/taxisnet/sync','POST',{token:token.slice(0,-3)+'xxx'})).status,400);
  assert.equal((await request('/api/taxisnet/sync','POST',{token,services:['myaade','business']})).status,202);
  const state=await finished(request);assert.equal(state.job.status,'partial');assert.equal(state.job.results.myaade.status,'success');assert.equal(state.job.results.business.status,'error');assert.equal(state.snapshots.myaade.collection.kind,'myaade');assert.ok(!JSON.stringify(state).includes(password));assert.ok(!JSON.stringify(state).includes('PRIVATE_COOKIE'));assert.ok(!JSON.stringify(state).includes(token));assert.ok(!readFileSync(join(directory,'state.enc'),'utf8').includes(password));assert.equal(openVault(directory).get().taxisnetCredentials,undefined);assert.equal(calls[0][1].password,password);
  fail=true;const clock=Date.now;Date.now=()=>clock()+11000;try{await request('/api/taxisnet/sync','POST',{token,services:['myaade']});const failed=await finished(request);assert.equal(failed.job.results.myaade.status,'error');assert.deepEqual(failed.snapshots.myaade,state.snapshots.myaade);}finally{Date.now=clock;}
  await request('/api/taxisnet/credentials','DELETE',{});assert.deepEqual((await request('/api/taxisnet')).data.snapshots,{});
  const old=Date.now;Date.now=()=>old()+22000;try{assert.equal((await request('/api/taxisnet/sync','POST',{token})).status,400);}finally{Date.now=old;}
 },async(path,data)=>{if(path==='/collect'){calls.push([path,structuredClone(data)]);return fail||data.service==='business'?{status:'error',code:'source_changed',message:password}:result(data.service);}return {};});
});
test('MFA pauses the job, preserves browser for confirmation, and resumes the same source',async()=>{
 let first=true;await harness(async({request})=>{const {token}=(await request('/api/taxisnet/credentials','POST',{username:'normal-user',password})).data;await request('/api/taxisnet/sync','POST',{token,services:['myaade','efka']});let state=await finished(request);assert.equal(state.job.status,'needs_verification');assert.equal(state.job.current,'myaade');assert.equal((await request('/api/portal/open','POST',{service:'myaade'})).status,409);assert.equal((await request('/api/taxisnet/resume','POST',{token})).status,202);state=await finished(request);assert.equal(state.job.status,'success');assert.equal(state.job.results.efka.status,'success');},async(path,data)=>{if(path==='/collect'){if(first){first=false;return {status:'needs_verification',code:'needs_verification'};}return result(data.service);}return {};});
});
test('authentication rejection stops further attempts and deleting connection discards an in-flight result',async()=>{
 const attempted=[];await harness(async({request})=>{const {token}=(await request('/api/taxisnet/credentials','POST',{username:'normal-user',password})).data;await request('/api/taxisnet/sync','POST',{token});const s=await finished(request);assert.equal(attempted.length,1);assert.equal(s.job.results.myaade.code,'auth_failed');assert.equal(s.job.results.efka.status,'skipped');},async(path,data)=>{if(path==='/collect'){attempted.push(data.service);return {status:'error',code:'auth_failed'};}return {};});
 let resolveWorker;const pending=new Promise(r=>resolveWorker=r);await harness(async({request})=>{const {token}=(await request('/api/taxisnet/credentials','POST',{username:'normal-user',password})).data;await request('/api/taxisnet/sync','POST',{token,services:['myaade']});await request('/api/taxisnet/credentials','DELETE',{});resolveWorker(result('myaade'));await new Promise(r=>setTimeout(r,10));const state=(await request('/api/taxisnet')).data;assert.equal(state.job,null);assert.deepEqual(state.snapshots,{});},async path=>path==='/collect'?pending:{});
});
test('identity boundaries and financial schema reject errors, menus and unknown responses instead of zero debt',()=>{
 assert.equal(identityMatches(afm,`AFM ${afm}`),true);assert.equal(identityMatches(afm,'10942592160'),false);assert.equal(identityMatches(afm,'094259217'),false);
 assert.equal(recognizedFinancial({error:'upstream'}),false);assert.equal(financialRows({tables:[['Οφειλές','Πληρωμές']],text:'Menu'}),null);assert.equal(financialRows({apiData:[{data:{message:'unavailable'}}]}),null);
 assert.equal(financialRows({tables:[[['Περιγραφή','Ποσό'],['Φόρος','25,00 €']]]}).tables.length,1);assert.equal(financialRows({text:'Δεν υπάρχουν οφειλές'}).empty,true);assert.equal(financialRows({text:'Εάν δεν έχετε οφειλές, ελέγξτε αργότερα.'}),null);
});

test('labeled AFM accepts official Greek punctuation and spacing without swallowing unrelated or oversized IDs',async()=>{
 const {labeledAfms}=await import('../portal-worker/identity.js');
 assert.deepEqual(labeledAfms('Α.Φ.Μ.: 094259216'),['094259216']);assert.deepEqual(labeledAfms('Α Φ Μ : 0 9 4 2 5 9 2 1 6'),['094259216']);assert.deepEqual(labeledAfms('Αριθμός Φορολογικού Μητρώου: 094259216'),['094259216']);assert.deepEqual(labeledAfms('AFM: 10942592160'),[]);assert.deepEqual(labeledAfms('ΑΦΜ αντισυμβαλλόμενου: 094259216'),[]);assert.deepEqual(labeledAfms('Payment reference 094259216'),[]);
});

test('unverified troubleshooting session stays encrypted and private and is revoked with the connection',async()=>{
 await harness(async({request,directory})=>{
  const {token}=(await request('/api/taxisnet/credentials','POST',{username:'normal-user',password})).data;
  await request('/api/taxisnet/sync','POST',{token,services:['myaade']});const state=await finished(request);
  assert.equal(state.job.results.myaade.code,'identity_unverified');assert.ok(!JSON.stringify(state).includes('UNVERIFIED_COOKIE'));
  assert.equal(openVault(directory).get().pendingPortalSessions.myaade.storage.cookies[0].value,'UNVERIFIED_COOKIE');assert.ok(!readFileSync(join(directory,'state.enc'),'utf8').includes('UNVERIFIED_COOKIE'));
  await request('/api/taxisnet/credentials','DELETE',{});assert.deepEqual(openVault(directory).get().pendingPortalSessions,{});
 },async path=>path==='/collect'?{status:'error',code:'identity_unverified',pendingSession:{url:'https://www1.aade.gr/taxisnet/info/protected/home.htm',storage:{cookies:[{name:'fixture',value:'UNVERIFIED_COOKIE'}]}}}:{});
});
