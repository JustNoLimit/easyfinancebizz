import {existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes, createCipheriv, createDecipheriv, createHmac} from 'node:crypto';
export function openVault(directory){
 mkdirSync(directory,{recursive:true,mode:0o700});
 const keyPath=join(directory,'vault.key'),statePath=join(directory,'state.enc'),setupPath=join(directory,'setup-token');
 if(!existsSync(keyPath)){if(existsSync(statePath))throw Error('Vault key is missing; restore the matching backup.');writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600});}
 const key=readFileSync(keyPath);if(key.length!==32)throw Error('Invalid vault key');
 const credentialKey=createHmac('sha256',key).update('easyfinance-client-credentials-v1').digest();
 let state={owner:null,credentials:null,snapshot:null};
 if(existsSync(statePath)){const envelope=JSON.parse(readFileSync(statePath,'utf8'));const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));state=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString());}
 if(!state.owner&&!existsSync(setupPath))writeFileSync(setupPath,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
 function save(next){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(JSON.stringify(next)),cipher.final()]);const envelope={iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};writeFileSync(statePath+'.tmp',JSON.stringify(envelope),{mode:0o600});renameSync(statePath+'.tmp',statePath);state=next;}
 function seal(value,scope){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',credentialKey,iv);cipher.setAAD(Buffer.from('taxisnet-client-v1:'+scope));const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');}
 function unseal(token,scope){if(typeof token!=='string'||token.length>4096||!/^[A-Za-z0-9_-]+$/.test(token))throw Error('Invalid credential envelope');const bytes=Buffer.from(token,'base64url');if(bytes.length<29)throw Error('Invalid credential envelope');const decipher=createDecipheriv('aes-256-gcm',credentialKey,bytes.subarray(0,12));decipher.setAAD(Buffer.from('taxisnet-client-v1:'+scope));decipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());}
 return {get:()=>state,save,seal,unseal,setupToken:()=>existsSync(setupPath)?readFileSync(setupPath,'utf8').trim():null,finishSetup(){if(existsSync(setupPath))unlinkSync(setupPath);}};
}
