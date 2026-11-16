import airports from './airports.json';
import cities from './cities.json';
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ё/g, 'е').trim();
const cityCatalog = cities.map(([code, cityRu, cityEn, country]) => ({code, city: cityRu || cityEn, name: 'Все аэропорты', country, isCity: true, terms: [code, cityRu, cityEn].filter(Boolean).map(normalize)}));
const catalog = [...cityCatalog, ...airports.map(([code, cityRu, cityEn, nameRu, nameEn, country]) => ({
 code, city: cityRu || cityEn || nameRu || nameEn, name: nameRu || nameEn || code, country,
 terms: [code, cityRu, cityEn, nameRu, nameEn].filter(Boolean).map(normalize)
}))];
export function searchAirports(query, limit = 12) {
 const term = normalize(query);
 if (!term) return [];
 return catalog.map(airport => ({airport, rank: airport.code.toLowerCase() === term ? 0 : airport.terms.some(t => t.startsWith(term)) ? 1 : airport.terms.some(t => t.includes(term)) ? 2 : 3}))
  .filter(item => item.rank < 3).sort((a,b) => a.rank-b.rank || a.airport.city.localeCompare(b.airport.city, 'ru') || Number(!!b.airport.isCity)-Number(!!a.airport.isCity) || a.airport.code.localeCompare(b.airport.code)).slice(0,limit).map(item => item.airport);
}
export function airportField(name, label, initial = '') {
 return `<div class="airport-field"><label for="${name}">${label}</label><input id="${name}" name="${name}" value="${initial}" placeholder="Город или код" required autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${name}-options" aria-describedby="${name}-hint"><small id="${name}-hint">Город на русском, English или IATA</small><div class="airport-options" id="${name}-options" role="listbox" aria-label="${label}: аэропорты" hidden></div><span class="airport-status" role="status" aria-live="polite"></span></div>`;
}
export function attachAirportPicker(input) {
 const box = input.closest('.airport-field'), list = box.querySelector('[role=listbox]'), status = box.querySelector('[role=status]'), hint = box.querySelector('small');
 let matches = [], active = -1, selected = catalog.find(a => a.code === input.value);
 const close = () => { list.hidden = true; input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); active = -1; };
 const select = airport => { selected = airport; input.value = airport.code; input.setCustomValidity(''); hint.textContent = `${airport.city} · ${airport.name}`; close(); };
 const highlight = index => {
  active = index;
  [...list.children].forEach((el,i) => el.setAttribute('aria-selected',String(i === active)));
  if (active >= 0) { input.setAttribute('aria-activedescendant',list.children[active].id); list.children[active].scrollIntoView({block:'nearest'}); }
 };
 const show = () => {
  matches = searchAirports(input.value); active = -1; list.replaceChildren(); input.removeAttribute('aria-activedescendant');
  if (!input.value.trim()) { status.textContent=''; close(); return; }
  for (const [i,airport] of matches.entries()) {
   const option = document.createElement('div'); option.id = `${input.id}-option-${i}`; option.setAttribute('role','option'); option.setAttribute('aria-selected','false');
   const title = document.createElement('span'); title.textContent = `${airport.city} · ${airport.code}`;
   const detail = document.createElement('small'); detail.textContent = `${airport.name} · ${airport.country}`;
   option.append(title,detail); option.addEventListener('mousedown',e => e.preventDefault()); option.addEventListener('click',() => { select(airport); input.focus(); close(); }); list.append(option);
  }
  if (!matches.length) { const empty=document.createElement('p'); empty.textContent='Аэропорты не найдены. Уточните город или код.'; list.append(empty); }
  list.hidden=false; input.setAttribute('aria-expanded','true'); status.textContent = matches.length ? `Найдено вариантов: ${matches.length}` : 'Аэропорты не найдены';
 };
 input.addEventListener('input',() => { selected=null; hint.textContent='Выберите город или аэропорт из списка'; input.setCustomValidity('Выберите город или аэропорт из списка.'); show(); });
 input.addEventListener('focus',show);
 input.addEventListener('blur',() => { const exact=matches.find(a => a.code.toLowerCase() === input.value.trim().toLowerCase()); if(exact) select(exact); close(); });
 input.addEventListener('keydown',e => {
  if(e.key === 'Escape') { e.preventDefault(); close(); }
  if(e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if(list.hidden) show(); if(matches.length) highlight((active+(e.key === 'ArrowDown' ? 1 : active < 0 ? 0 : -1)+matches.length)%matches.length); }
  if(e.key === 'Enter' && !list.hidden) { e.preventDefault(); const airport=matches[active] || matches.find(a => a.code.toLowerCase() === input.value.trim().toLowerCase()) || (matches.length === 1 ? matches[0] : null); if(airport) select(airport); }
 });
 input.form.addEventListener('reset',() => { close(); selected=null; input.setCustomValidity(''); });
 if(selected) select(selected);
}
