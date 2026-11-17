// Read-only VAT return listing. This does not calculate a VAT balance or submit a return.
import {officialUrl} from './policy.js';

const fold = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
const vat = /(?:φ\s*\.?\s*π\s*\.?\s*α\.?|\bvat\b)/i;
const period = /περιοδ|τριμην|μηνα|μηνας|ετος|χρησ|period|quarter|year/i;
const result = /χρεωστικ|πιστωτικ|μηδενικ|ποσο|υπολοιπ|καταβολ|debit|credit|amount|balance/i;
const submitted = /υποβληθ|υποβολης|αριθμ.*δηλωσ|αριθμ.*καταχωρ|ημερομηνια.*υποβολ|κατασταση|status|submitted|filing/i;

// Only recognize rows whose own headings describe VAT return periods and results.
// Keep source text intact: different return forms label signs and totals differently.
export function parseVatSnapshot(snapshot) {
 if (!snapshot || !officialUrl(snapshot.source || '')) return null;
 const tables = [];
 for (const rows of snapshot.tables || []) {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > 101 || !rows.every(r => Array.isArray(r) && r.every(c => typeof c === 'string'))) continue;
  const headers = rows[0].map(fold), joined = headers.join(' ');
  if (!headers.some(h => period.test(h)) || !submitted.test(joined)) continue;
  const data = rows.slice(1).filter(row => row.some(c => /\d/.test(c)));
  if (data.length) tables.push([rows[0], ...data]);
 }
 const lines = String(snapshot.text || '').split(/\n/).map(fold);
 // An explicit empty result must mention returns and VAT, not general instructions.
 const empty = lines.some(line => vat.test(line) && /δηλωσ/.test(line) && /δεν (?:υπαρχουν|βρεθηκαν|εχουν υποβληθει)|καμια/.test(line) && !/εαν|εφοσον|περιπτωση|αν δεν/.test(line));
 if (!tables.length && !empty) return null;
 return {tables, empty: !tables.length && empty, apiData: [], balances:'unknown'};
}

// Build a GET URL only for the observed periodic VAT listing endpoint. Values
// come from the official form and remain in the browser/session, never logs.
export function yearlyVatUrl(form, base, currentYear = new Date().getFullYear()) {
 let baseUrl, url;
 try { baseUrl = new URL(base); url = new URL(form.action, baseUrl); } catch { return null; }
 if (baseUrl.origin !== 'https://www1.aade.gr' || url.origin !== baseUrl.origin || url.pathname !== '/taxisnet/vat/protected/displayLiabilitiesForYear.htm' || url.search || url.hash || String(form.method || 'get').toLowerCase() !== 'get') return null;
 if (form.name !== 'gotovatF2') return null;
 if (!Array.isArray(form.fields) || form.fields.some(f => !f.name || typeof f.value !== 'string' || /^(?:password|file|submit|button|image|reset)$/i.test(f.type || ''))) return null;
 const declarations = form.fields.filter(f => f.name === 'declarationType');
 if (declarations.length !== 1 || declarations[0].value !== 'vatF2') return null;
 const years = form.fields.filter(f => f.name === 'year');
 if (years.length !== 1 || !/^20\d{2}$/.test(years[0].value)) return null;
 // The selected option belongs to the source form; an invalid selection is not guessed.
 if (+years[0].value > currentYear + 1 || +years[0].value < 2000) return null;
 for (const field of form.fields) url.searchParams.append(field.name, field.value);
 return url.href;
}

export async function openYearlyVatListing(getPage) {
 const page = getPage();
 if (!page || new URL(page.url()).origin !== 'https://www1.aade.gr') return false;
 const forms = await page.locator('form').evaluateAll(forms => forms.map(form => {
  const fields = [];
  for (const el of form.elements) {
   if (!el.name || el.disabled || /^(?:submit|button|image|reset|file|password)$/i.test(el.type || '') || ((el.type === 'checkbox' || el.type === 'radio') && !el.checked)) continue;
   if (el.tagName === 'SELECT' && el.multiple) for (const option of el.selectedOptions) fields.push({name:el.name,value:option.value,type:'select'});
   else fields.push({name:el.name,value:el.value,type:el.type || ''});
  }
  return {name:form.getAttribute('name') || '',action:form.getAttribute('action') || '',method:form.getAttribute('method') || 'get',label:[form.innerText,form.closest('tr')?.innerText,form.getAttribute('aria-label')].filter(Boolean).join(' '),fields};
 }));
 const urls = forms.map(form => yearlyVatUrl(form,page.url())).filter(Boolean);
 if (urls.length !== 1) return false;
 await page.goto(urls[0],{waitUntil:'domcontentloaded',timeout:20000});
 await getPage().waitForTimeout(800);
 return true;
}

// The caller must have verified the expected AFM before calling and capture() must
// continue enforcing it. Navigation is restricted to exact read-only labels;
// absence of an observed entry point is reported as source_changed by the caller.
export async function collectVatReturn({getPage, capture, afm, follow, settled, verify}) {
 if (!/^\d{9}$/.test(afm)) throw Error('Invalid AFM');
 const p = getPage();
 if (!p || !officialUrl(p.url())) return null;
 // AADE's public service page links to /taxisnet/vat. Use HTTPS for the GET.
 // https://www.aade.gr/diloseis-fpa-vies
 await p.goto('https://www1.aade.gr/taxisnet/vat', {waitUntil:'domcontentloaded',timeout:20000});
 await getPage().waitForTimeout(800);
 if (!getPage() || !officialUrl(getPage().url())) return null;
 if (settled && await settled(getPage) !== 'ready') return {needsVerification:true};
 const openedYearly=await openYearlyVatListing(getPage);
 if(!openedYearly){await follow(getPage, /^(?:Εφαρμογές|Φορολογικές υπηρεσίες|Δηλώσεις)$/i);
 await follow(getPage, /^(?:Δηλώσεις ΦΠΑ|ΦΠΑ|Δήλωση ΦΠΑ|Δηλώσεις Φ\.Π\.Α\.)$/i);
 // A return application may offer a separate listing. Never click New, Submit,
 // payment, authorization, or consent controls.
 await follow(getPage, /^(?:Υποβληθείσες δηλώσεις(?: ΦΠΑ)?|Προβολή δηλώσεων(?: ΦΠΑ)?|Ιστορικό δηλώσεων(?: ΦΠΑ)?)$/i);}
 if (settled && await settled(getPage) !== 'ready') return {needsVerification:true};
 if (verify && !await verify(afm)) return {status:'error',code:'identity_unverified',message:'Δεν επιβεβαιώθηκε το ΑΦΜ στην εφαρμογή ΦΠΑ.'};
 const result = await capture(afm);
 const snapshot = result?.snapshot;
 if (!snapshot || !officialUrl(snapshot.source || '')) return null;
 const headings = await getPage().locator('h1,h2,h3,h4,[role=heading]').allTextContents();
 if (!vat.test(headings.join(' ')) && !vat.test(snapshot.source)) return null;
 const data = parseVatSnapshot(snapshot);
 if (!data) return null;
 const section = {title:'Κατάσταση δηλώσεων ΦΠΑ',source:snapshot.source,...data};
 snapshot.collection = {kind:'vatreturn',sections:[section],complete:false};
 snapshot.tables = data.tables;
 snapshot.apiData = [];
 snapshot.scope = 'Κατάσταση δηλώσεων ΦΠΑ για το επιλεγμένο έτος. Τα υπόλοιπα δεν έχουν επιβεβαιωθεί και η κάλυψη περιόδων ή σελίδων μπορεί να είναι ελλιπής.';
 delete snapshot.image;
 return {status:'success',...result};
}
