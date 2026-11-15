const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function dateField(name, label) {
 return `<div class="date-picker"><label>${label}<input class="date-display" type="text" inputmode="numeric" placeholder="ДД.ММ.ГГГГ" aria-label="${label}, ДД.ММ.ГГГГ" required pattern="[0-9]{2}\\.[0-9]{2}\\.[0-9]{4}" autocomplete="off"></label><input type="hidden" name="${name}"><button type="button" class="date-toggle" aria-label="Открыть календарь: ${label}" aria-expanded="false">▦</button><div class="date-popover" hidden></div></div>`;
}
export function attachDatePicker(input) {
 const host=input.closest('.date-picker'), display=host.querySelector('.date-display'), toggle=host.querySelector('.date-toggle'), popup=host.querySelector('.date-popover');
 input.min=iso(new Date());
 let month=new Date(); month.setDate(1);
 const format=value=>value?value.split('-').reverse().join('.'):'';
 function validate() {
  const match=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(display.value);
  const value=match?`${match[3]}-${match[2]}-${match[1]}`:'';
  const parsed=new Date(value+'T12:00:00');
  const valid=value && !Number.isNaN(parsed.getTime()) && iso(parsed)===value && value>=input.min;
  display.setCustomValidity(display.value&&!valid?'Введите корректную дату не раньше '+format(input.min):'');
  input.value=valid?value:'';
 }
 function sync() { display.value=format(input.value); validate(); }
 function close() {popup.hidden=true;toggle.setAttribute('aria-expanded','false');}
 function render() {
  const year=month.getFullYear(), m=month.getMonth(), offset=(new Date(year,m,1).getDay()+6)%7, days=new Date(year,m+1,0).getDate();
  popup.innerHTML=`<div class="date-navigation"><button type="button" data-step="-1" aria-label="Предыдущий месяц">‹</button><strong aria-live="polite">${month.toLocaleDateString('ru-RU',{month:'long',year:'numeric'})}</strong><button type="button" data-step="1" aria-label="Следующий месяц">›</button></div><div class="date-grid">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>`<span>${d}</span>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({length:days},(_,i)=>{const value=iso(new Date(year,m,i+1));return `<button type="button" data-date="${value}" ${value<input.min?'disabled':''} aria-label="${format(value)}" aria-pressed="${value===input.value}">${i+1}</button>`;}).join('')}</div>`;
 }
 toggle.onclick=()=>{if(!popup.hidden){close();return;} const value=input.value||input.min;month=new Date(value+'T12:00:00');month.setDate(1);render();popup.hidden=false;toggle.setAttribute('aria-expanded','true');};
 popup.onclick=e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.step){month.setMonth(month.getMonth()+Number(button.dataset.step));render();}else if(button.dataset.date){input.value=button.dataset.date;sync();input.dispatchEvent(new Event('change',{bubbles:true}));close();toggle.focus();}};
 display.addEventListener('input',validate);
 display.addEventListener('change',()=>{validate();input.dispatchEvent(new Event('change',{bubbles:true}));});
 input.addEventListener('change',sync);
 host.addEventListener('keydown',e=>{if(e.key==='Escape'){close();toggle.focus();}});
 host.addEventListener('focusout',e=>{if(!host.contains(e.relatedTarget))close();});
 document.addEventListener('click',e=>{if(!host.contains(e.target))close();});
 return {sync};
}
