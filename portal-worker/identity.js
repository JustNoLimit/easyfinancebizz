import {officialUrl} from './policy.js';
const afmLabel=/(?:α\s*\.?\s*φ\s*\.?\s*μ\s*\.?|afm|αριθμο[σς] φορολογικου μητρωου|tax identification number)\s*[:：]?\s*((?:[0-9][ \t\u00a0.-]*){8}[0-9])(?![ \t\u00a0.-]*[0-9])/giu;
const normalize=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').replace(/[\t\r ]+/g,' ');
export function labeledAfms(text){const result=[];const normalized=normalize(text);for(const m of normalized.matchAll(afmLabel)){const context=normalized.slice(Math.max(0,m.index-70),m.index).split('\n').at(-1);if(/αντισυμβαλλομεν|πελατη|προμηθευτη|counterparty|supplier|customer/i.test(context))continue;const afm=m[1].replace(/[^0-9]/g,'');if(afm.length===9)result.push(afm);}return [...new Set(result)];}
export function officialFrames(page){return page.frames().filter(frame=>officialUrl(frame.url()));}
export async function verifyIdentity(page,afm){
 if(!/^\d{9}$/.test(afm))return false;
 for(const frame of officialFrames(page)){
  try{
   const text=await frame.locator('body').innerText({timeout:1500});
   if(labeledAfms(text).includes(afm))return true;
   const values=await frame.evaluate(()=>{
    const profile=/στοιχε[ίι]α\s+(?:χρ[ήη]στη|φορολογο[ύυ]μενου|μητρ[ώω]ου|επιχε[ίι]ρησης)|τα\s+στοιχε[ίι]α\s+μου|taxpayer|user\s+profile/i;
    return [...document.querySelectorAll('input[readonly],input:disabled')].filter(input=>{
     if(!input.getBoundingClientRect().width||!input.getBoundingClientRect().height)return false;
     const label=[input.id,input.name,input.getAttribute('aria-label'),input.labels?.[0]?.textContent].join(' ');
     return /(?:afm|tin|α\.?φ\.?μ)/i.test(label)&&profile.test(input.closest('form,section,article,fieldset,table')?.textContent||'');
    }).map(input=>input.value);
   });
   if(values.some(value=>value.trim()===afm))return true;
  }catch{}
 }
 return false;
}
export async function identityDiagnostic(page,afm){
 const frames=[];for(const frame of officialFrames(page).slice(0,8)){
  try{const u=new URL(frame.url()),text=await frame.locator('body').innerText({timeout:1000});frames.push({location:u.origin+u.pathname.replace(/[0-9]{9,}/g,':id'),labeledAfmPresent:labeledAfms(text).length>0,expectedAfmPresent:labeledAfms(text).includes(afm),passwordPresent:await frame.locator('input[type=password]:visible').count()>0,loading:/^(?:φορτ|loading)/i.test(text.trim()),errorNotice:/σφ[άα]λμα|πρ[όο]βλημα|error|μη διαθ[έε]σιμη/i.test(text),sessionNotice:/συνεδρ[ίι]α|session (?:expired|ended)/i.test(text),navigation:await frame.locator('a:visible,input[type=button]:visible,button:visible').evaluateAll(elements=>elements.map(e=>{const label=[e.innerText,e.tagName==='INPUT'?e.value:'',e.getAttribute('title'),e.getAttribute('aria-label'),...Array.from(e.querySelectorAll('img[alt]')).map(i=>i.alt)].filter(Boolean).join(' ').normalize('NFD').replace(/\p{M}/gu,'');const kind=/μητρω|φορολογουμεν|profile|registry/i.test(label)?'profile':/οφειλ|debt/i.test(label)?'debts':/προσωποποιημεν/i.test(label)?'personal-information':null;if(!kind)return null;let location='';try{const u=new URL(e.getAttribute('href'),document.URL);if(u.protocol==='https:')location=u.origin+u.pathname.replace(/[0-9]{9,}/g,':id');}catch{}return {kind,location,imageLabel:!!e.querySelector('img[alt]')};}).filter(Boolean).slice(0,30))});}catch{}
 }return {stage:'identity',frames,checkedAt:new Date().toISOString()};
}
