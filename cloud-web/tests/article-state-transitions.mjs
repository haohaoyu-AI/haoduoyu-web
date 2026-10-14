import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('lib/article-state-transitions.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
vm.runInNewContext(js,{exports});

// Mock persisted states exercise the transition guard without touching any Site data.
const article={state:'needs_verification'};
assert.equal(exports.canTransitionArticleStatus(article.state,'toutiao_saving'),true);
assert.equal(exports.canTransitionArticleStatus('toutiao_saving','failed'),true);
assert.equal(exports.canTransitionArticleStatus('needs_verification','failed'),false);
assert.equal(exports.canTransitionArticleStatus('completed','toutiao_saving'),false);
assert.equal(exports.canTransitionArticleStatus('completed','failed'),false);

const delivery={state:'needs_verification'};
assert.equal(exports.canTransitionDeliveryStatus(delivery.state,'saving'),true);
assert.equal(exports.canTransitionDeliveryStatus('saving','failed'),true);
assert.equal(exports.canTransitionDeliveryStatus('needs_verification','failed'),false);
assert.equal(exports.canTransitionDeliveryStatus('saved','saving'),false);
assert.equal(exports.canTransitionDeliveryStatus('saved','failed'),false);

console.log('Mock article and delivery states: verified recovery can resume saving, explicit in-progress failures are recordable, and terminal states stay closed');
