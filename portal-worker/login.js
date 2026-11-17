import {officialUrl} from './policy.js';
const userSelector='input[name="j_username"]:visible,input#j_username:visible,input[name="username"]:visible,input#username:visible';
const passwordSelector='input[name="j_password"][type="password"]:visible,input#j_password[type="password"]:visible,input[name="password"][type="password"]:visible,input#password[type="password"]:visible';
export async function taxisnetForm(page){if(!officialUrl(page.url()))return null;const url=new URL(page.url());if(!((url.hostname==='gsis.gr'||url.hostname.endsWith('.gsis.gr'))&&/\/(?:login(?:\.jsp|\.do)?|j_spring_security_check)(?:\/|$)/i.test(url.pathname))&&!(url.hostname==='www1.aade.gr'&&/^\/taxisnet\/login(?:\.do|\.jsp|\/|$)/i.test(url.pathname)))return null;const username=page.locator(userSelector),password=page.locator(passwordSelector);if(await username.count()!==1||await password.count()!==1)return null;const form=password.locator('xpath=ancestor::form[1]');if(await form.count()!==1)return null;const submit=form.locator('button:visible,input[type="submit"]:visible').filter({hasText:/σ[ύυ]νδεση|ε[ίι]σοδος|login|sign\s*in/i});const buttons=await submit.count()===1?submit:form.locator('input[type="submit"]:visible');if(await buttons.count()!==1)return null;return {username,password,submit:buttons};}
export async function startTaxisnet(page,service){if(await taxisnetForm(page))return true;let url=new URL(page.url());if(['employer','efka','keao'].includes(service)&&url.hostname==='services.e-efka.gov.gr'&&url.pathname==='/'){const insured=page.getByText('Είσοδος Ασφαλισμένου',{exact:true});await Promise.any([insured.waitFor({state:'visible',timeout:5000}),page.waitForURL(u=>u.pathname.includes('openid-connect/auth'),{timeout:5000})]);if(new URL(page.url()).pathname==='/')await insured.click({timeout:3000,noWaitAfter:true});await page.waitForURL(u=>u.pathname.includes('openid-connect/auth'),{timeout:8000});url=new URL(page.url());}if(['employer','efka','keao'].includes(service)&&url.hostname==='services.e-efka.gov.gr'&&/openid-connect\/auth/.test(url.pathname)){const entry=page.getByText('Είσοδος μόνο με Taxisnet',{exact:true});await entry.waitFor({state:'visible',timeout:7000});await entry.click({timeout:3000,noWaitAfter:true});}else if(['myaade','vatreturn','business'].includes(service)&&url.hostname==='www1.aade.gr'&&/\/(?:aadeapps3|gsisapps5)\/myaade\/?$/.test(url.pathname)){const cookie=page.getByText('Ενημερώθηκα',{exact:true});if(await cookie.count()===1&&await cookie.isVisible()){await cookie.click({timeout:2000});await page.waitForTimeout(700);}let account=page.locator('button,a,[role=button],[routerlink]').filter({hasText:/Ο\s+Λογαριασμός\s+μου/}).filter({visible:true});if(await account.count()===0){await page.mouse.click(395,40);await account.first().waitFor({state:'visible',timeout:5000});}const popup=page.context().waitForEvent('page',{timeout:3000}).catch(()=>null);await account.first().click({timeout:3000});const opened=await popup;if(opened){page=opened;await page.waitForLoadState('domcontentloaded',{timeout:10000});}}else return false;
 await page.locator(passwordSelector).first().waitFor({state:'visible',timeout:15000});return !!await taxisnetForm(page);}
export async function submitTaxisnet(page,input){const form=await taxisnetForm(page);if(!form)throw Error('Άνοιξε πρώτα την επίσημη φόρμα Taxisnet. Οι κωδικοί δεν αποστέλλονται σε άλλα πεδία.');await form.username.fill(input.username.trim());await form.password.fill(input.password);await form.submit.click({timeout:10000,noWaitAfter:true});await page.waitForTimeout(600);}

export async function authenticationFailure(page){
 if(!await taxisnetForm(page))return null;
 const regions=await page.locator('[role=alert]:visible,.error:visible,.alert-danger:visible,.red-text:visible,#errorMessage:visible,#loginError:visible,#login-error:visible,#error:visible').allTextContents();
 for(const value of regions){const text=value.normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/g,' ').trim();
  if(/(?:λογαριασμ.{0,80}(?:κλειδω|απενεργο)|account.{0,50}(?:locked|disabled)|too many (?:login|failed))/i.test(text))return 'auth_locked';
  if(/εαν|σε περιπτωση|if you/i.test(text))continue;
  if(/(?:λανθασμεν|εσφαλμεν|μη εγκυρ|λαθος|invalid|incorrect|bad).{0,100}(?:κωδικ|στοιχει|χρηστ|password|username|credential)/i.test(text))return 'auth_failed';
 }
 return null;
}

// Only the two observed EFKA authentication handoffs are authorized here.
const foldHandoff=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/g,' ').trim().toUpperCase();
export function efkaHandoffKind(url,screen,afm){
 let u;try{u=new URL(url);}catch{return null;}
 if(!officialUrl(url)||!/^\d{9}$/.test(afm)||!screen||screen.challenge)return null;
 const text=foldHandoff(screen.text);
 if((u.hostname==='gsis.gr'||u.hostname.endsWith('.gsis.gr'))&&/\/oauth2server\//i.test(u.pathname)&&
  text.includes('ΑΥΘΕΝΤΙΚΟΠΟΙΗΣΗ ΧΡΗΣΤΗ')&&text.includes('ΝΕΟ ΟΛΟΚΛΗΡΩΜΕΝΟ ΠΛΗΡΟΦΟΡΙΑΚΟ ΣΥΣΤΗΜΑ ΕΦΚΑ')&&
  text.includes('E-SERVICES ΠΟΛΙΤΕΣ/ΕΠΙΧΕΙΡΗΣΕΙΣ')&&text.includes('ΒΑΣΙΚΑ ΣΤΟΙΧΕΙΑ ΜΗΤΡΩΟΥ')&&
  screen.continueChecked===true&&screen.fields?.length===0)return 'consent';
 if(u.hostname==='services.e-efka.gov.gr'&&(/\/eEfkaExtAuth\/realms\/EFKA\/login-actions\/(?:authenticate|required-action)$/.test(u.pathname)||/^\/ssp\.commonservices\.auth(?:entication)?\/views\/(?:login|confirmation)\.xhtml$/.test(u.pathname))&&
  text.includes('ΑΦΜ')&&screen.fields?.length===1&&screen.fields[0].readonly===true&&screen.fields[0].value===afm&&
  /ΑΦΜ|AFM/i.test(foldHandoff(screen.fields[0].label)))return 'afm';
 return null;
}
export async function advanceEfkaHandoff(page,afm,completed=new Set()){
 if(!officialUrl(page.url()))return false;
 const screen=await page.evaluate(()=>{
  const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.visibility!=='hidden'&&s.display!=='none'&&r.width>0&&r.height>0;};
  const text=document.body?.innerText||'';
  const fields=Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=radio]):not([type=checkbox]),select,textarea')).filter(visible).map(e=>({value:e.value,readonly:e.readOnly===true||e.disabled===true,label:[e.name,e.id,e.getAttribute('aria-label'),...(e.labels?Array.from(e.labels).map(l=>l.innerText):[])].filter(Boolean).join(' ')}));
  const radios=Array.from(document.querySelectorAll('input[type=radio]')).filter(visible);
  const selected=radios.filter(e=>e.checked);
  const continueChecked=selected.length===1&&selected[0].labels&&Array.from(selected[0].labels).some(l=>/^\s*Συνέχεια\s*$/i.test(l.innerText));
  const challenge=!!document.querySelector('iframe[src*="captcha" i],.g-recaptcha,.h-captcha,input[autocomplete="one-time-code"]:not([type=hidden])')||/captcha|κωδικ[όο]ς μιας χρ[ήη]σης|one.time.code/i.test(text);
  return {text,fields,continueChecked,challenge};
 });
 const kind=efkaHandoffKind(page.url(),screen,afm);if(!kind||completed.has(kind)||(kind==='afm'&&!completed.has('consent')))return false;
 const button=page.getByRole('button',{name:kind==='consent'?'Αποστολή':'Υποβολή',exact:true});
 if(await button.count()!==1||!await button.isVisible()||!await button.isEnabled())return false;
 completed.add(kind);await button.click({timeout:5000,noWaitAfter:true});return true;
}
