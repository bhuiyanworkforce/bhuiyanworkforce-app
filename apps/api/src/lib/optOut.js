// Decides whether an incoming reply reads as a refusal ("not interested", "stop writing", Greek equivalents).
// Best effort on the subject and the first lines of the message. A match only flags the lead for the
// owner to read; a miss leaves the lead as "replied". Pure function, no imports, so it can be tested alone.

export function normalizeForMatch(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[’‘`´]/g, "'")
}

// Lowercased, punctuation turned into spaces, whitespace collapsed.
function flatten(text) {
  return normalizeForMatch(text).replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim()
}

// Cut the quoted older message ("On Tue ... wrote:", "-----Original Message", Greek "έγραψε") so only the new text is read.
function newTextOnly(flat) {
  const marks = [
    / on [^.]{0,90}? wrote /,
    / original message /,
    / from [^ ]+@[^ ]+ sent /,
    / σε? ?[^.]{0,90}? εγραψε /,
    / στισ [^.]{0,90}? εγραψε /,
    / ο η [^.]{0,90}? εγραψε /,
  ]
  let cut = flat.length
  for (const re of marks) {
    const m = re.exec(` ${flat} `)
    if (m && m.index < cut) cut = Math.max(0, m.index - 1)
  }
  return flat.slice(0, cut).trim()
}

const EN = [
  "not (currently |really |at all |very |so |that |particularly )?interested",
  "uninterested",
  "no (interest|thanks|thank you|need|vacanc(y|ies)|openings?|requirement)",
  "no thank",
  "not (hiring|recruiting|looking|needed|required|relevant|applicable|for us|a fit|a good fit)",
  "(do not|don't|dont|doesn't|does not|did not|didn't) (need|want|require|have any (need|vacanc))",
  "(we|i) (are|am|re|m) not (in need|in the market|taking)",
  "no longer (need|hiring|interested|looking|recruiting)",
  "(we|i)( will| would|'ll) pass",
  "(pass|passing) on this",
  "decline",
  "unsubscribe",
  "(remove|delete|take) (me|us|my|our)",
  "stop (emailing|writing|contacting|sending|messaging|mailing)",
  "(do not|don't|dont|never|please do not|please don't) (contact|email|write|message|send|mail|reach)",
  "leave (me|us) alone",
  "(this is |it is |it's )?spam",
  "report(ing)? (you|this)",
  "(no|not) (need|want) (for |of )?(workers|staff|labou?r|your (services|workers|offer))",
]

const EL = [
  "δεν (μασ |μου |σασ )?(ενδιαφερ|χρειαζ|θελ|προσλαμβαν|χρειαζεται|απαιτειται|ψαχνουμε|αναζητουμε|προκειται)",
  "δεν εχουμε (αναγκη|κενεσ|θεσεισ|ενδιαφερον)",
  "δεν (ειμαστε|ειμαι) (ενδιαφερομενοι|ενδιαφερομενο|ενδιαφερομενη)",
  "χωρισ ενδιαφερον",
  "οχι ευχαριστω",
  "οχι ευχαριστουμε",
  "μην (μου |μασ )?(στελνετε|γραφετε|επικοινωνειτε|ενοχλειτε|ξαναστειλετε)",
  "σταματηστε",
  "(διαγραψτε|αφαιρεστε|διαγραφη|απεγγραφη|αφαιρεση)",
  "παραιτουμαστε",
  "απορριπτουμε",
  "δεν (προκειται|θα) (να )?(προσλαβουμε|χρησιμοποιησουμε)",
  "(ενοχληση|σπαμ|spam)",
  // Greeklish
  "den (mas |mou )?(endiaferei|endiaferomaste|endiaferomai|xreiazomaste|xreiazomai)",
]


const MORE = [
  // Italian
  "non (siamo|sono|ci|mi) (interessat|interessa)", "non ci interessa", "no grazie", "non (abbiamo bisogno|ci serve|ci servono|assumiamo|cerchiamo|ho bisogno)",
  "non (contattateci|scriveteci|scrivete|contattarci|inviate|mandate)", "(cancellate|rimuovete|cancellami|rimuovimi|cancellateci)", "disiscri", "smettete di",
  // Portuguese
  "nao (estamos|temos|tenho|me|nos) ?(interessad|interessa|interesse|precisamos|preciso|precisa)", "sem interesse", "nao (precisamos|preciso)", "nao,? obrigad", "nao (contacte|contactem|envie|enviem|escreva|escrevam|nos contacte)",
  "(remova|removam|apague|apaguem|cancele a subscri)", "(parem|pare) de", "nao (estamos a )?(contratar|recrutar)", "nao temos vagas",
  // Polish
  "nie (jestesmy|jestem) zainteresowan", "nie interesuje", "nie interesuja", "nie,? dziekuj", "nie potrzebujemy", "nie potrzebuje", "nie zatrudniamy", "nie poszukujemy",
  "prosze (nie|o usuniecie|usunac|o zaprzestanie)", "prosimy (nie|o usuniecie|o zaprzestanie)", "nie piszcie", "wypisa", "rezygnuj", "przestan",
  // Czech
  "nemame zajem", "nemam zajem", "nezajima", "nejsme zainteresovan", "nejsem zainteresovan", "ne,? dekuji", "nepotrebujeme", "nepotrebuji", "nenabirame", "neosloveujte", "nepiste", "odhlasit", "odstrante", "smazte",
  // Slovak
  "nemame zaujem", "nemam zaujem", "nezaujima", "nie sme zainteresovan", "nie,? dakujem", "nenaberame", "nekontaktujte", "odhlas", "vymazte",
  // Slovenian
  "nismo zainteresiran", "nas ne zanima", "ne zanima", "ne,? hvala", "ne potrebujemo", "ne iscemo", "ne zaposlujemo", "ne pisite", "ne kontaktirajte", "odjav", "izbrisite", "odstranite",
  // Croatian, Bosnian, Serbian (Latin)
  "nismo zainteresovan", "nije nam potrebn", "ne zanima nas", "ne trebamo", "ne treba nam", "ne trebaju nam", "ne zaposljavamo", "ne trazimo", "nemojte (nam )?(pisati|slati|kontaktirati|saljite|pisite)", "molimo (vas )?ne", "obrisite", "uklonite",
  // Serbian (Cyrillic) and Macedonian
  "нисмо заинтересован", "не занима", "не,? хвала", "не треба", "немоите", "немојте", "не пишите", "обришите",
  "не сме заинтересирани", "не ни интересира", "не,? благодарам", "не ни треба", "не бараме", "не вработуваме", "не ни пишувајте", "избришете", "отстранете",
  // Bulgarian
  "не сме заинтересован", "не ни интересува", "не ни трябва", "не,? благодаря", "не търсим", "не наемаме", "не ни пишете", "моля,? не", "премахнете", "изтриите", "отписване", "спрете",
  // Hungarian
  "nem erdekel", "nem vagyunk erdekelt", "nem,? koszon", "nincs szuksegunk", "nincs szuksegem", "nem keresunk", "nem veszunk fel", "ne irjon", "ne keressen", "ne kuldjon", "ne zaklasson", "leiratkoz", "kerem,? ne ", "toroljenek", "toroljon",
  // Lithuanian
  "nesidomime", "nesidomiu", "nedomina", "ne,? aciu", "nereikia", "neieskome", "nesamdome", "nerasykite", "nesiuskite", "nesikreipkite", "atsisakome", "pasalinkite", "istrinkite", "nenorime",
  // Latvian
  "neinteres", "nav intereses", "nav (nepieciesams|vajadzigs|vajadzigi)", "ne,? paldies", "nerakstiet", "nesutiet", "nevelamies", "izdzesiet", "dzesiet", "atteikties", "nevajag", "nemeklejam",
  // Romanian
  "nu (suntem|sunt) interes", "nu ne intereseaza", "nu,? multumesc", "nu avem nevoie", "nu angajam", "nu cautam", "nu ne (mai )?scrieti", "nu ne contactati", "stergeti", "dezabon", "renuntam",
  // Turkish (Cyprus)
  "ilgilenmiyoruz", "ilgilenmiyorum", "hay[iı]r,? tesekkur", "ihtiyac(imiz|ımız) yok", "yazmayin", "listeden cikarin",
  // Arabic
  "غير مهتم", "لسنا مهتمين", "لست مهتم", "لا (نحتاج|احتاج|نرغب|نريد|نبحث)", "لا شكرا", "لا توجد (وظائف|شواغر)", "لا يوجد لدينا", "لا (تراسلونا|تراسلنا|تتصلوا|تتواصلوا)", "(ارجو|نرجو|يرجي) عدم", "الغاء الاشتراك", "احذفوا", "احذف", "توقفوا عن", "توقف عن", "ازاله",
]

const REFUSAL_RE = new RegExp(`(^| )(${[...EN, ...EL, ...MORE].join('|')})`)
const BARE_NO_RE = /^(no|nope|nein|non|nie|ne|nem|nu|nao|οχι|не|لا)( thanks| thank you)?$/

export function looksLikeRefusal(subject, summary, ownLines = []) {
  let body = ` ${flatten(summary)} `
  for (const line of ownLines) {
    const f = flatten(line)
    if (f) body = body.split(f).join(' ')
  }
  const fresh = newTextOnly(body.trim())
  const subj = flatten(subject).replace(/^(re |fwd |fw |απ |αν )+/, '')
  const text = `${subj} ${fresh}`.trim()
  const flatFresh = fresh.trim()
  if (BARE_NO_RE.test(flatFresh)) return true
  return REFUSAL_RE.test(` ${text} `) 
}

// ── Opt-out footer in the lead's own language ─────────────────────────────────
export const OPT_OUT_EN =
  'If you would rather not hear from us, reply with "no thanks" and we will not write again.'

const FOOTERS = {
  el: 'Αν προτιμάτε να μην λαμβάνετε άλλα μηνύματα από εμάς, απαντήστε «όχι ευχαριστώ» και δεν θα σας γράψουμε ξανά.',
  it: 'Se preferisce non ricevere altri nostri messaggi, risponda «no grazie» e non le scriveremo più.',
  pt: 'Se preferir não receber mais mensagens nossas, responda «não, obrigado» e não voltaremos a escrever.',
  pl: 'Jeśli nie chcą Państwo otrzymywać od nas dalszych wiadomości, prosimy odpowiedzieć „nie, dziękuję”, a nie napiszemy ponownie.',
  cs: 'Pokud od nás nechcete dostávat další zprávy, odpovězte „ne, děkuji“ a nebudeme vám již psát.',
  sk: 'Ak si neželáte dostávať ďalšie správy od nás, odpovedzte „nie, ďakujem“ a nebudeme vám už písať.',
  sl: 'Če ne želite prejemati več sporočil od nas, odgovorite »ne, hvala« in vam ne bomo več pisali.',
  sh: 'Ako ne želite primati daljnje poruke od nas, odgovorite „ne, hvala“ i nećemo vam više pisati.',
  mk: 'Ако не сакате да добивате повеќе пораки од нас, одговорете „не, благодарам“ и нема повторно да ви пишуваме.',
  bg: 'Ако предпочитате да не получавате повече съобщения от нас, отговорете „не, благодаря“ и повече няма да ви пишем.',
  hu: 'Ha nem szeretne több üzenetet kapni tőlünk, válaszoljon „nem, köszönöm” üzenettel, és nem írunk többet.',
  lt: 'Jei nenorite gauti daugiau mūsų laiškų, atsakykite „ne, ačiū“, ir daugiau jums nerašysime.',
  lv: 'Ja nevēlaties saņemt no mums vairāk ziņu, atbildiet „nē, paldies”, un mēs jums vairs nerakstīsim.',
  ro: 'Dacă preferați să nu mai primiți mesaje de la noi, răspundeți „nu, mulțumesc” și nu vă vom mai scrie.',
  ar: 'إذا كنتم تفضلون عدم تلقي المزيد من الرسائل منا، يرجى الرد بـ «لا، شكراً» ولن نراسلكم مرة أخرى.',
}

const COUNTRY_LANG = {
  greece: 'el', cyprus: 'el',
  italy: 'it', portugal: 'pt', poland: 'pl',
  'czech republic': 'cs', czechia: 'cs', slovakia: 'sk', slovenia: 'sl',
  croatia: 'sh', bosnia: 'sh', 'bosnia and herzegovina': 'sh', 'bosnia herzegovina': 'sh', serbia: 'sh', montenegro: 'sh',
  'north macedonia': 'mk', macedonia: 'mk', bulgaria: 'bg', hungary: 'hu',
  lithuania: 'lt', latvia: 'lv', romania: 'ro',
  uae: 'ar', 'united arab emirates': 'ar', 'saudi arabia': 'ar', qatar: 'ar', kuwait: 'ar', oman: 'ar',
  bahrain: 'ar', jordan: 'ar', lebanon: 'ar', iraq: 'ar', egypt: 'ar',
}

export const ALL_FOOTERS = [OPT_OUT_EN, ...Object.values(FOOTERS)]

// The footer is written in the company's language, then repeated in English, so it
// still makes sense when the email itself is in English or the country is unmapped.
export function optOutFooter(country, bodyText = '') {
  const key = normalizeForMatch(country).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
  let lang = COUNTRY_LANG[key]
  if (!lang && /[Ͱ-Ͽἀ-῿]/.test(bodyText)) lang = 'el'
  const local = lang ? FOOTERS[lang] : null
  return local ? `${local}\n${OPT_OUT_EN}` : OPT_OUT_EN
}
