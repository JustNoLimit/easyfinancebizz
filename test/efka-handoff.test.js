import test from 'node:test';
import assert from 'node:assert/strict';
import {efkaHandoffKind,advanceEfkaHandoff} from '../portal-worker/login.js';
const afm='123456789';
const consent={text:'Αυθεντικοποίηση Χρήστη ΝΕΟ ΟΛΟΚΛΗΡΩΜΕΝΟ ΠΛΗΡΟΦΟΡΙΑΚΟ ΣΥΣΤΗΜΑ ΕΦΚΑ (ΟΠΣ - ΕΦΚΑ) – E-SERVICES ΠΟΛΙΤΕΣ/ΕΠΙΧΕΙΡΗΣΕΙΣ θα αποκτήσει πρόσβαση στα βασικά στοιχεία Μητρώου',continueChecked:true,fields:[]};
const confirm={text:'ΑΦΜ',fields:[{readonly:true,value:afm,label:'ΑΦΜ'}]};
const gsis='https://www1.gsis.gr/oauth2server/oauth/authorize';
const efka='https://services.e-efka.gov.gr/eEfkaExtAuth/realms/EFKA/login-actions/authenticate';
test('only the observed EFKA consent and matching AFM screens qualify',()=>{
 assert.equal(efkaHandoffKind(gsis,consent,afm),'consent');
 assert.equal(efkaHandoffKind(gsis,{...consent,continueChecked:false},afm),null);
 assert.equal(efkaHandoffKind(gsis,{...consent,text:consent.text.replace('ΕΦΚΑ','ΑΑΔΕ')},afm),null);
 assert.equal(efkaHandoffKind('https://example.com/oauth2server/oauth/authorize',consent,afm),null);
 assert.equal(efkaHandoffKind(efka,confirm,afm),'afm');
 assert.equal(efkaHandoffKind('https://services.e-efka.gov.gr/other',confirm,afm),null);
 assert.equal(efkaHandoffKind(efka,confirm,'987654321'),null);
 assert.equal(efkaHandoffKind(efka,{...confirm,fields:[{...confirm.fields[0],readonly:false}]},afm),null);
 assert.equal(efkaHandoffKind(efka,{...confirm,fields:[...confirm.fields,{value:'x'}]},afm),null);
 assert.equal(efkaHandoffKind(efka,{...confirm,challenge:true},afm),null);
});
test('clicks the exact authorized button once and rejects ambiguous controls',async()=>{
 let clicks=0,count=1;const page={url:()=>gsis,evaluate:async()=>consent,getByRole:(_role,options)=>({count:async()=>count,isVisible:async()=>true,isEnabled:async()=>true,click:async()=>{assert.equal(options.name,'Αποστολή');clicks++;}})};
 const completed=new Set();assert.equal(await advanceEfkaHandoff(page,afm,completed),true);assert.equal(await advanceEfkaHandoff(page,afm,completed),false);assert.equal(clicks,1);
 count=2;assert.equal(await advanceEfkaHandoff(page,afm,new Set()),false);assert.equal(clicks,1);
});
test('AFM submission requires the preceding recognized consent in this attempt',async()=>{
 let clicks=0;const page={url:()=>efka,evaluate:async()=>confirm,getByRole:(_role,options)=>({count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,click:async()=>{assert.equal(options.name,'Υποβολή');clicks++;}})};
 assert.equal(await advanceEfkaHandoff(page,afm,new Set()),false);
 assert.equal(await advanceEfkaHandoff(page,afm,new Set(['consent'])),true);
 assert.equal(clicks,1);
});
