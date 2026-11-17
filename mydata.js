import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {createHash} from 'node:crypto';
export class ServiceError extends Error{constructor(code,message,status=502){super(message);this.code=code;this.status=status;}}
const bases={production:'https://mydatapi.aade.gr/myDATA/',sandbox:'https://mydataapidev.aade.gr/'};
export function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
export function validateRange(from,to){if(!validDate(from)||!validDate(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>366)throw new ServiceError('range','Επίλεξε έγκυρο διάστημα έως 366 ημέρες.',400);}
export function validAfm(value){if(typeof value!=='string'||!/^\d{9}$/.test(value)||value==='000000000')return false;return [...value.slice(0,8)].reduce((sum,n,i)=>sum+Number(n)*2**(8-i),0)%11%10===Number(value[8]);}
const parser=new XMLParser({ignoreAttributes:true,removeNSPrefix:true,parseTagValue:false,processEntities:true,trimValues:true,isArray:name=>name==='bookInfo'});
const money=value=>{if(value===undefined||value==='')return 0;const text=String(value);if(!/^-?\d+(?:\.\d+)?$/.test(text)||!Number.isFinite(Number(text))||Math.abs(Number(text))>1e12)throw new ServiceError('format','Μη έγκυρη αριθμητική τιμή από ΑΑΔΕ.');return Math.round(Number(text)*100)/100;};
export function parseBook(xml,type,range){
 if(/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw new ServiceError('xml','Μη έγκυρη απόκριση XML από ΑΑΔΕ.');
 const parsed=parser.parse(xml),root=parsed.RequestedBookInfo;
 if(root===undefined||(typeof root==='string'&&root!=='')||(typeof root==='object'&&Object.keys(root).some(k=>!['bookInfo','continuationToken'].includes(k))))throw new ServiceError('response','Η ΑΑΔΕ δεν επέστρεψε αναμενόμενα στοιχεία βιβλίου.');
 const rows=root?.bookInfo||[];
 const records=rows.map(row=>{const date=String(row.issueDate||'').slice(0,10),invoiceType=String(row.invType||'');if(!validDate(date)||date<range.from||date>range.to||!/^\d{1,2}\.\d{1,2}$/.test(invoiceType))throw new ServiceError('format','Μη αναμενόμενη εγγραφή βιβλίου από ΑΑΔΕ.');
 const count=Number(row.count);if(!Number.isSafeInteger(count)||Math.abs(count)>1000000)throw new ServiceError('format','Μη έγκυρο πλήθος παραστατικών.');
 const counterVat=String(row.counterVatNumber||''),minMark=String(row.minMark||''),maxMark=String(row.maxMark||'');
 const identity=JSON.stringify([type,date,invoiceType,counterVat,row.selfpricing||'',row.invoiceDetailType||'',minMark,maxMark]);
 return {id:'aade-'+createHash('sha256').update(identity).digest('hex'),type,date,invoiceType,counterVat,count,minMark,maxMark,amount:money(row.netValue),vatAmount:money(row.vatAmount),grossValue:money(row.grossValue),description:`${invoiceType} · ${counterVat||'Χωρίς ΑΦΜ'} · ${count} παραστ.`,category:'myDATA',source:'mydata'};});
 const token=root?.continuationToken;let next=null;if(token){if(typeof token.nextPartitionKey!=='string'||typeof token.nextRowKey!=='string'||!token.nextPartitionKey||!token.nextRowKey||token.nextPartitionKey.length>2048||token.nextRowKey.length>2048)throw new ServiceError('pagination','Μη έγκυρη σελιδοποίηση ΑΑΔΕ.');next={nextPartitionKey:token.nextPartitionKey,nextRowKey:token.nextRowKey};}
 return {records,next};
}
async function limitedText(response){if(Number(response.headers.get('content-length'))>2097152)throw new ServiceError('size','Η απόκριση είναι πολύ μεγάλη. Επίλεξε μικρότερο διάστημα.');let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>2097152){await response.body.cancel().catch(()=>{});throw new ServiceError('size','Η απόκριση είναι πολύ μεγάλη. Επίλεξε μικρότερο διάστημα.');}chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
export function createMyDataClient(fetcher=fetch){return async function sync(credentials,from,to){
 validateRange(from,to);if(!bases[credentials.environment])throw new ServiceError('environment','Μη έγκυρο περιβάλλον.',400);
 const abort=AbortSignal.timeout(120000),all=[];let totalBytes=0;
 for(const [type,method] of [['income','RequestMyIncome'],['expense','RequestMyExpenses']]){let next=null;const visited=new Set();for(let page=0;;page++){
 if(page>=100)throw new ServiceError('pages','Πάρα πολλές σελίδες. Επίλεξε μικρότερο διάστημα.');
 const url=new URL(method,bases[credentials.environment]);url.searchParams.set('dateFrom',from.split('-').reverse().join('/'));url.searchParams.set('dateTo',to.split('-').reverse().join('/'));url.searchParams.set('entityVatNumber',credentials.afm);if(next)for(const [k,v]of Object.entries(next))url.searchParams.set(k,v);
 let response;try{response=await fetcher(url,{method:'GET',headers:{'aade-user-id':credentials.username,'ocp-apim-subscription-key':credentials.key},redirect:'error',signal:AbortSignal.any([abort,AbortSignal.timeout(20000)])});}catch{throw new ServiceError('network','Δεν ήταν δυνατή η επικοινωνία με την ΑΑΔΕ. Δοκίμασε ξανά αργότερα.');}
 if(response.status===401||response.status===403)throw new ServiceError('credentials','Η ΑΑΔΕ απέρριψε τα στοιχεία. Έλεγξε χρήστη, κλειδί και περιβάλλον.',422);
 if(response.status===429)throw new ServiceError('rate','Όριο κλήσεων ΑΑΔΕ. Περίμενε πριν ξαναδοκιμάσεις.',429);
 if(!response.ok)throw new ServiceError('upstream','Η υπηρεσία ΑΑΔΕ δεν είναι διαθέσιμη αυτή τη στιγμή.');
 const xml=await limitedText(response);totalBytes+=Buffer.byteLength(xml);if(totalBytes>10485760)throw new ServiceError('size','Επίλεξε μικρότερο διάστημα συγχρονισμού.');const result=parseBook(xml,type,{from,to});all.push(...result.records);if(all.length>50000)throw new ServiceError('size','Πάρα πολλές εγγραφές. Επίλεξε μικρότερο διάστημα.');next=result.next;if(!next)break;const token=JSON.stringify(next);if(visited.has(token))throw new ServiceError('pagination','Επαναλαμβανόμενη σελίδα ΑΑΔΕ. Ο συγχρονισμός ακυρώθηκε.');visited.add(token);
 }}
 const unique=new Map();for(const r of all){if(unique.has(r.id)&&JSON.stringify(unique.get(r.id))!==JSON.stringify(r))throw new ServiceError('duplicate','Ασυνεπείς διπλές εγγραφές ΑΑΔΕ.');unique.set(r.id,r);}return {records:[...unique.values()],from,to,environment:credentials.environment,syncedAt:new Date().toISOString()};
};}
