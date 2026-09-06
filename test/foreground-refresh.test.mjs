import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html=readFileSync(new URL('../app.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('    let foregroundRefreshPending='),html.indexOf('    const loadingView='));
function setup(mode='species') {
  let now=100000;
  const calls=[],events={},timers=[];
  const context=vm.createContext({
    Date:{now:()=>now},console:{warn(){}},
    document:{visibilityState:'visible',getElementById:()=>({value:'rovello'}),addEventListener:(name,fn)=>events[name]=fn},
    window:{addEventListener:(name,fn)=>events[name]=fn},
    setInterval:(fn,delay)=>timers.push({fn,delay}),
    experienceMode:mode,mapUnlocked:true,mapReady:true,initialMapLoaded:true,
    lastPredictionLoadAt:now,FOREGROUND_REFRESH_INTERVAL:60000,
    load:async (species,options)=>calls.push({mode:'species',species,preserveView:options.preserveView}),
    loadDiscovery:async options=>calls.push({mode:'discovery',preserveView:options.preserveView}),
  });
  vm.runInContext(source,context);
  return {context,calls,events,timers,advance:ms=>now+=ms};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

for(const mode of ['species','discovery']) {
  test(`resume refreshes ${mode}, preserves view and coalesces iOS events`,async()=>{
    const h=setup(mode);
    h.events.focus();h.events.visibilitychange();h.events.pageshow();
    await settle();
    assert.equal(h.calls.length,1);
    assert.equal(h.calls[0].mode,mode);
    assert.equal(h.calls[0].preserveView,true);
    h.events.focus();await settle();assert.equal(h.calls.length,1);
    h.advance(2000);h.events.online();await settle();assert.equal(h.calls.length,2);
  });
}

test('background, locked and uninitialized maps never refresh',async()=>{
  for(const [key,value] of [['mapUnlocked',false],['mapReady',false],['initialMapLoaded',false]]) {
    const h=setup();h.context[key]=value;h.events.focus();await settle();assert.equal(h.calls.length,0);
  }
  const h=setup();h.context.document.visibilityState='hidden';
  h.advance(60000);h.events.focus();h.timers[0].fn();await settle();assert.equal(h.calls.length,0);
  h.context.document.visibilityState='visible';h.events.visibilitychange();await settle();assert.equal(h.calls.length,1);
});

test('visible periodic refresh is throttled and retries after rejection',async()=>{
  const h=setup();assert.equal(h.timers[0].delay,60000);
  h.timers[0].fn();await settle();assert.equal(h.calls.length,0);
  h.advance(60000);h.timers[0].fn();await settle();assert.equal(h.calls.length,1);
  h.advance(2000);h.context.load=async()=>{throw Error('offline');};
  h.events.online();await settle();
  h.advance(2000);h.context.load=async()=>h.calls.push({retried:true});
  h.events.online();await settle();assert.equal(h.calls.length,2);
});

test('a slow in-flight refresh cannot start a second load',async()=>{
  const h=setup();let finish;
  h.context.load=()=>new Promise(resolve=>finish=resolve);
  h.events.focus();await settle();h.advance(60000);
  h.context.load=async()=>h.calls.push('unexpected');
  h.events.focus();await settle();assert.equal(h.calls.length,0);
  finish();await settle();h.advance(2000);
  h.events.focus();await settle();assert.equal(h.calls.length,1);
});
