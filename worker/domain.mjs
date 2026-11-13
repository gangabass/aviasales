export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const today = () => new Date().toISOString().slice(0, 10);
export function validDate(value) {
 return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function validateMonitor(input) {
 const origin = String(input.origin || '').trim().toUpperCase();
 const destination = String(input.destination || '').trim().toUpperCase();
 if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || origin === destination) throw new HttpError(400, 'Укажите разные IATA-коды городов из трёх букв.');
 const { dateMin, dateMax } = input;
 if (!validDate(dateMin) || !validDate(dateMax) || dateMin < today() || dateMax < dateMin || (Date.parse(dateMax) - Date.parse(dateMin)) / 86400000 > 92 || dateMax > new Date(Date.now()+365*86400000).toISOString().slice(0,10)) throw new HttpError(400, 'Выберите будущие даты в пределах года, диапазон — до 93 дней.');
 if (typeof input.threshold !== 'number' || !Number.isFinite(input.threshold) || input.threshold < 1 || input.threshold > 10000000) throw new HttpError(400, 'Цена должна быть от 1 до 10 000 000 ₽.');
 if (input.directOnly !== false) throw new HttpError(400, 'Пока поддерживается поиск с любым количеством пересадок.');
 return { origin, destination, dateMin, dateMax, threshold: Math.round(input.threshold * 100) / 100, directOnly: input.directOnly };
}
export function ribbonUrl(m) {
 const url = new URL('https://tickets-api.aviasales.ru/search/prices/ribbon');
 url.search = new URLSearchParams({origin:m.origin, origin_type:'city',destination:m.destination,destination_type:'city',currency:'RUB',brand:'AS',market:'ru',trip_class:'Y',passengers_adults:'1',passengers_children:'0',passengers_infants:'0',is_one_way:'true',filters_state: '{}',depart_date_min:m.date_min < today() ? today() : m.date_min,depart_date_max:m.date_max});
 return url;
}
export function parsePrices(body, m) {
 if (!body || !Array.isArray(body.prices)) throw new Error('API Aviasales вернул неожиданный формат.');
 // The ribbon minimum may include connections; direct-only fares are not inferred.
 return body.prices.filter(p => validDate(p.depart_date) && p.depart_date >= m.date_min && p.depart_date >= today() && p.depart_date <= m.date_max && typeof p.value === 'number' && Number.isFinite(p.value) && p.value > 0 && (!m.direct_only || p.no_directs === false))
 .map(p => ({date:p.depart_date, price:p.value})).sort((a,b) => a.price-b.price || a.date.localeCompare(b.date));
}
export function ticketUrl(m, date) {
 const compact = date.slice(8,10) + date.slice(5,7);
 return `https://www.aviasales.ru/search/${m.origin}${compact}${m.destination}1`;
}
export const shouldNotify = (price, previous) => previous == null || price < previous;
export async function hash(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))), b=>b.toString(16).padStart(2,'0')).join(''); }
export function publicMonitor(m) { return {id:m.id,origin:m.origin,destination:m.destination,dateMin:m.date_min,dateMax:m.date_max,threshold:m.threshold,directOnly:!!m.direct_only,enabled:!!m.enabled,checkedAt:m.checked_at,bestPrice:m.best_price,bestDate:m.best_date,prices:JSON.parse(m.prices),error:m.error}; }
export function validateSubscription(sub) {
 let url; try { url = new URL(sub?.endpoint); } catch { throw new HttpError(400,'Некорректная push-подписка.'); }
 const host = url.hostname;
 const trusted = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host === 'web.push.apple.com' || host.endsWith('.push.apple.com') || host === 'wns.windows.com' || host.endsWith('.notify.windows.com');
 if (!trusted || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || sub.endpoint.length > 2048 || !/^[A-Za-z0-9_-]{87}=?$/.test(sub.keys?.p256dh || '') || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(sub.keys?.auth || '')) throw new HttpError(400,'Push-сервис или ключи подписки не поддерживаются.');
 return {endpoint:sub.endpoint, expirationTime:null,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}};
}


