import test from 'node:test';
import assert from 'node:assert/strict';
// Import JSON through a data URL so these checks also run on Node 22.
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../src/airport-picker.js', import.meta.url),'utf8')).replace("import airports from './airports.json';",`const airports=${await readFile(new URL('../src/airports.json',import.meta.url),'utf8')};`);
const {searchAirports} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('airport search accepts Russian and English cities and airport codes', () => {
 for (const query of ['Москва','moscow',' MOSCOW ']) {
  const codes=searchAirports(query).map(a=>a.code);
  assert.ok(codes.includes('SVO')); assert.ok(codes.includes('DME')); assert.ok(codes.includes('VKO'));
 }
 assert.equal(searchAirports('svo')[0].code,'SVO');
 assert.equal(searchAirports('Иркутск')[0].code,'IKT');
 assert.equal(searchAirports('irkutsk')[0].code,'IKT');
 assert.ok(searchAirports('Шереметьево').some(a=>a.code==='SVO'));
 assert.ok(searchAirports('Bangkok').some(a=>a.code==='BKK'));
});
test('empty and unknown searches and result limit', () => {
 assert.deepEqual(searchAirports('  '),[]);
 assert.deepEqual(searchAirports('zzzzzzzzzzzz'),[]);
 assert.equal(searchAirports('a',3).length,3);
});
