import test from 'node:test';
import assert from 'node:assert/strict';
import {state} from '../web/core/state.mjs';
import {renderAccounts, accountModal, testProfile} from '../web/pages/settings.mjs';
import {publicBusinessRoute} from '../src/public-business.mjs';

test('account page exposes creation for public business with empty and populated lists', () => {
  state.me = {id:'public-business', publicBusiness:true};
  state.accountProfiles = [];
  for (const accounts of [[], [{id:'synthetic', name:'Test', platform:'zhihu', active:true}]]) {
    state.accounts = accounts;
    const html = renderAccounts();
    assert.equal((html.match(/data-action="new-account"/g) || []).length, 1);
    assert.match(html, /只需填写公开主页链接/);
  }
  assert.equal(publicBusinessRoute('/accounts', 'POST'), true);
  assert.equal(publicBusinessRoute('/account-profiles', 'GET'), true);
  assert.equal(publicBusinessRoute('/api-keys', 'GET'), false);
});

test('creation asks only for a homepage and format test describes its limits', () => {
  state.accounts = []; state.accountProfiles = [];
  const overlay = {innerHTML:'', contains:()=>false};
  const input = {value:'https://www.zhihu.com/people/synthetic/answers', addEventListener(){}};
  const result = {innerHTML:'', textContent:''};
  globalThis.document = {activeElement:null, body:{style:{}}, querySelector(selector) {
    return selector === '#overlay' ? overlay : selector === '#field-profile-url' ? input :
      selector === '#profile-test-result' ? result : selector === '#account-form' ? {dataset:{id:''}} : null;
  }};
  globalThis.requestAnimationFrame = () => {};
  try {
    accountModal();
    assert.match(overlay.innerHTML, /name="profile_url"[^>]*required/);
    assert.doesNotMatch(overlay.innerHTML, /name="name"/);
    assert.match(overlay.innerHTML, /profile_ext\?action=home&amp;__biz=/);
    assert.match(overlay.innerHTML, /data-action="test-profile"/);
    testProfile();
    assert.match(result.innerHTML, /格式有效/);
    assert.match(result.innerHTML, /访问情况无法自动核验/);
    assert.match(result.innerHTML, /https:\/\/www\.zhihu\.com\/people\/synthetic/);
    input.value = 'https://evil.invalid/people/a';
    testProfile(); assert.match(result.textContent, /格式未通过/);
  } finally { delete globalThis.document; delete globalThis.requestAnimationFrame; }
});


 test('accounts route survives desktop and phone layout for public business', async () => {
  const {readRoute, mobilePage} = await import('../web/core/router.mjs');
  state.me = {id:'public-business', publicBusiness:true}; state.accounts = [];
  globalThis.location = {search:'?page=settings&tab=accounts'};
  try {
    for (const mobile of [false, true]) {
      globalThis.window = {matchMedia:()=>({matches:mobile})};
      readRoute();
      assert.equal(state.page, 'settings'); assert.equal(state.settingsTab, 'accounts');
      assert.equal(mobilePage('settings'), 'settings');
      assert.match(renderAccounts(), /data-action="new-account"/);
    }
  } finally { delete globalThis.location; delete globalThis.window; }
});
