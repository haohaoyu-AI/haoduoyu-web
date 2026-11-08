'use strict';
window.fixture = {ready:false,error:null,value:null};
window.fixtureSet = text => {
  const tx = window.fixtureDb.transaction('values','readwrite');
  tx.objectStore('values').put(text,'saved');
  tx.oncomplete = () => { window.fixture.value=text; document.querySelector('#status').textContent='COMMITTED: '+text; };
  tx.onerror = () => { window.fixture.error='transaction failed'; };
};
const open = indexedDB.open('haoduoyu-host-synthetic-test',1);
open.onupgradeneeded = () => open.result.createObjectStore('values');
open.onsuccess = () => {
  window.fixtureDb=open.result;
  const tx=open.result.transaction('values','readonly');
  const get=tx.objectStore('values').get('saved');
  get.onsuccess=() => { window.fixture.value=get.result??null; };
  tx.oncomplete=() => { window.fixture.ready=true; document.querySelector('#status').textContent='READY: '+String(window.fixture.value); };
};
open.onerror=() => { window.fixture.error='open failed'; };
const requests=new Map();
window.haoduoyuLocalLifecycle=Object.freeze({requestFlush(id){requests.set(id,'complete');return true;},status(id){return {state:requests.get(id)||'unknown'};}});
