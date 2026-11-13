import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMonitor,parsePrices,ribbonUrl,hash,shouldNotify } from '../server/domain.mjs';
const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const input=()=>({origin:'ikt',destination:'BKK',dateMin:day(2),dateMax:day(20),threshold:25000,directOnly:false});
test('validation: IATA, dates, threshold, unsupported direct filter',()=>{
 assert.equal(validateMonitor(input()).origin,'IKT');
 for(const patch of [{origin:'xxx?url='},{destination:'IKT'},{dateMin:'2027-02-30'},{dateMax:day(100)},{dateMin:day(-1)},{threshold:0},{threshold:'25000'},{threshold:Infinity},{directOnly:true}])assert.throws(()=>validateMonitor({...input(),...patch}));
});
test('ribbon URL uses expected one-way search parameters',()=>{const m={origin:'IKT',destination:'BKK',date_min:day(2),date_max:day(20)};const url=ribbonUrl(m);assert.equal(url.hostname,'tickets-api.aviasales.ru');assert.equal(url.searchParams.get('is_one_way'),'true');assert.equal(url.searchParams.get('depart_date_min'),day(2));assert.equal(url.searchParams.get('filters_state'),'{}');});
test('prices: reject bad format, ignore non-fares and dates outside range, choose actual minimum',()=>{
 const m={date_min:day(2),date_max:day(20)};
 assert.throws(()=>parsePrices({},m));
 const p=parsePrices({prices:[{depart_date:day(2),value:26000},{depart_date:day(3),value:21000},{depart_date:day(4),value:0},{depart_date:day(5),value:null},{depart_date:day(21),value:1},{depart_date:day(-1),value:1}]},m);
 assert.deepEqual(p,[{date:day(3),price:21000},{date:day(2),price:26000}]);
});
test('notifications repeat only on lower price',()=>{assert.equal(shouldNotify(20000,null),true);assert.equal(shouldNotify(20000,20000),false);assert.equal(shouldNotify(21000,20000),false);assert.equal(shouldNotify(19999,20000),true);});
test('token is stored as SHA-256 hash',async()=>{assert.equal((await hash('secret')).length,64);assert.notEqual(await hash('secret'),'secret');});
