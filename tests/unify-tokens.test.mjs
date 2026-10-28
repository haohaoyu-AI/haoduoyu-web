import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {projectOct28History} from './oct28-projection.mjs';

const root=new URL('../',import.meta.url),baseline='6e2e445e8a3e9f7a4af055f4cf75046cf6e5cd6c';
const files=['style.css','memos.css','glass.css','workbench.css'];
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const source=read('tokens.css');
const tokens=new Map([...source.matchAll(/(--[\w-]+):([^;]+);/g)].map(match=>[match[1],match[2].trim()]));
const references=value=>[...value.matchAll(/var\((--[\w-]+)\)/g)].map(match=>match[1]);
function resolve(name,ancestors=[]) {
  assert.ok(tokens.has(name),'defined shared token: '+name);
  assert.ok(!ancestors.includes(name),'no shared-token cycle: '+[...ancestors,name].join(' -> '));
  return tokens.get(name).replace(/var\((--[\w-]+)\)/g,(_,child)=>resolve(child,[...ancestors,name]));
}
function expand(css) {
  return css.replace(/var\((--[\w-]+)\)/g,(expression,name)=>tokens.has(name)?resolve(name):expression);
}

test('shared design tokens are root-only constants with complete, acyclic references',()=>{
  assert.ok(tokens.size>100,'the existing palette and intermediate sizes are preserved rather than rounded');
  const structural=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/@charset\s+"UTF-8";/,'').trim();
  assert.match(structural,/^:root\s*\{[^{}]+\}$/,'token extraction adds no selectors, media rules or behavior');
  for(const [name,value]of tokens) {
    for(const reference of references(value))assert.ok(tokens.has(reference),name+' uses a shared constant');
    resolve(name);
  }
});

test('expanding only extracted constants restores all four released stylesheets byte for byte',()=>{
  for(const file of files) {
    const original=execFileSync('git',['show',baseline+':public/'+file],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
    const released=projectOct28History('public/'+file,read(file));
    assert.equal(expand(released),original,'no changed declarations, selectors, cascade positions or responsive rules: '+file);
    assert.ok(references(read(file)).some(name=>tokens.has(name)),'stylesheet consumes centralized values: '+file);
  }
});

test('the documented scales coexist with actual intermediate sizes and existing glass geometry',()=>{
  for(const value of [12,14,16,18,22,28])assert.equal(resolve('--font-size-'+value),value+'px');
  for(const value of [4,8,12,16,24,32])assert.equal(resolve('--space-'+value),value+'px');
  for(const value of [11,13,15,20,21,23,24,26,30,32])assert.equal(resolve('--font-size-'+value),value+'px');
  assert.equal(resolve('--color-primary'),'#a44e38');assert.equal(resolve('--color-base-primary'),'#0b6b61');
  assert.equal(resolve('--size-control'),'44px');assert.equal(resolve('--size-control-base'),'34px');
  assert.equal(resolve('--glass-blur-12'),'12px');assert.equal(resolve('--glass-blur-16'),'16px');
  assert.equal(resolve('--duration-160'),'160ms');assert.equal(resolve('--duration-180'),'180ms');
});

test('palette, type, corners, elevation and motion values reside in the shared token sheet',()=>{
  for(const file of files) {
    const css=read(file);
    assert.doesNotMatch(css,/#[0-9a-fA-F]{3,8}\b|rgba?\([^()]+\)/,'literal palette stays centralized: '+file);
    assert.doesNotMatch(css,/font-size\s*:\s*\d+(?:\.\d+)?px/,'type sizes stay centralized: '+file);
    assert.doesNotMatch(css,/border-radius\s*:[^;}]*\d+(?:\.\d+)?px/,'corners stay centralized: '+file);
    assert.doesNotMatch(css,/box-shadow\s*:[^;}]*\d+(?:\.\d+)?px/,'elevation stays centralized: '+file);
    assert.doesNotMatch(css,/(?:animation|transition)(?:-delay|-duration)?\s*:[^;}]*\d+ms/,'motion stays centralized: '+file);
  }
});
