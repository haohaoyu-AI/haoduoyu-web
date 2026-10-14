// These selectors were read from the owner's existing completed Toutiao editor
// through official Cua read-only DOM on 2026-10-06. They are partial by design:
// no new import menu/chooser/save/image/cover control was activated for diagnosis.
export const observedToutiaoStructure = {
  observed_at: '2026-10-06T09:28:42Z',
  observed_url: 'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=7693469929114321450',
  account: {css: 'a[href*="www.toutiao.com/c/user/61556093362/"]', attribute: 'href', encoding: 'toutiao_profile_href'},
  title: {placeholder: '请输入文章标题（2～30个字）'},
  body: {css: 'div.ProseMirror[contenteditable="true"]'},
  missing_observations: ['article-only image selector', 'draft-list row/editor link', 'import menu and file input', 'exact saved indicator', 'ordered-list toggle', 'image insertion', 'Zhihu identity/title/body/private cover controls'],
};
// Never infer current body/image content from historical verified receipts.
// Never attach a made-up image selector or mark an unobserved control as observed.
export function stampObservedBinding(structure, key) {
  const control = structure[key];
  if (!control || !structure.observed_url || !structure.observed_at) throw Error('Observed binding absent');
  return {...control, observed_at: structure.observed_at, observed_url: structure.observed_url};
}
