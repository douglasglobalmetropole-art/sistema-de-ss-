'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AsyncLocalStorage}=require('node:async_hooks');
const {BoundedMap,scopedMap,singleFlight,invalidate}=require('../lib/performance');
const {startPolling}=require('../lib/worker-polling');
test('cache limitado e isolamento entre requisicoes concorrentes',async()=>{
 const context=new AsyncLocalStorage(),map=scopedMap(()=>context.getStore(),2);
 await Promise.all(['principal','lote1','ODVV'].map(scope=>context.run(scope,async()=>{
  map.set('a',scope);await Promise.resolve();assert.equal(map.get('a'),scope);
  map.set('b',2);map.set('c',3);assert.equal(map.size,2);assert.equal(map.get('a'),undefined);
 })));
 invalidate();context.run('principal',()=>assert.equal(map.size,0));
 const bounded=new BoundedMap(1);bounded.set('a',1).set('b',2);assert.equal(bounded.size,1);
});
test('singleFlight compartilha trabalho e libera falhas para nova tentativa',async()=>{
 const run=singleFlight();let count=0;
 const load=async()=>{count++;await Promise.resolve();return 42;};
 assert.deepEqual(await Promise.all(Array.from({length:50},()=>run('same',load))),Array(50).fill(42));
 assert.equal(count,1);await assert.rejects(run('fail',async()=>{throw Error('fail');}));
 assert.equal(await run('fail',load),42);
});
test('fila drena imediatamente, aguarda quando vazia e nunca sobrepoe operacoes',async()=>{
 const tasks=[];let active=0,maxActive=0,cycle=0;
 const poll=startPolling(async()=>{active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;return ++cycle<3;},{idleMs:1000,schedule(fn,ms){tasks.push({fn,ms});return tasks.length;},cancel(){}});
 assert.equal(tasks[0].ms,0);
 await tasks.shift().fn();assert.equal(tasks[0].ms,0);
 await tasks.shift().fn();assert.equal(tasks[0].ms,0);
 await tasks.shift().fn();assert.equal(tasks[0].ms,1000);assert.equal(maxActive,1);
 poll.stop();await tasks.shift().fn();assert.equal(tasks.length,0);
});
test('erro de ciclo usa recuo sem repetir operacao dentro do ciclo',async()=>{
 const tasks=[];let calls=0;
 const poll=startPolling(async()=>{calls++;throw Error('offline');},{errorMs:5000,onError(){},schedule(fn,ms){tasks.push({fn,ms});},cancel(){}});
 await tasks.shift().fn();assert.equal(calls,1);assert.equal(tasks[0].ms,5000);poll.stop();
});
