/** Read-only DOM observations. No runtime runner behavior or permission changes.
 * These are selectors with provenance, not a grant to upload or change a draft.
 * Missing/blocked observations must not be invented by the caller.
 */
const observed = (url, at, control) => ({...control, observed_url: url, observed_at: at});
const toutiaoUrl = 'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=7693469929114321450';
const zhihuUrl = 'https://zhuanlan.zhihu.com/p/2090827581717209991/edit';
export const toutiaoReadOnlyBindings = {
  account: observed(toutiaoUrl, '2026-10-06T09:53:25Z', {css: 'a[href*="www.toutiao.com/c/user/61556093362/"]', attribute: 'href', encoding: 'toutiao_profile_href'}),
  title: observed(toutiaoUrl, '2026-10-06T09:53:25Z', {placeholder: '请输入文章标题（2～30个字）'}),
  body: observed(toutiaoUrl, '2026-10-06T09:57:16Z', {
    css: 'div.ProseMirror[contenteditable="true"]',
    // One visible image per wrapper; TEMPL contains an extra serialized copy.
    image_css: '.img-wrapper > .img-loading-container > img',
    // Actual serialization + image toolbar links; not generic div/figure exclusion.
    chrome_css: 'templ, a.editor-image-menu-item',
  }),
  captions: observed(toutiaoUrl, '2026-10-06T09:53:25Z', {css: 'div.ProseMirror[contenteditable="true"] textarea.pgc-img-caption-ipt'}),
  covers: observed(toutiaoUrl, '2026-10-06T09:53:25Z', {css: '.article-cover-img-wrap > img[alt="cover"]'}),
  observed_state: {body_paragraphs: 55, rendered_images: 18, rendered_images_loaded: 18, unique_image_resources: 18, serialized_and_rendered_img_total: 36, caption_fields: 18, nonempty_captions: 0, covers: 3, body_matches_historical_receipt: true},
  historical_difference: {expected_images: 22, observed_images: 18, action: 'report_only_do_not_repair'},
  missing: ['current explicit saved indicator', 'draft list', 'import entrance and chooser trigger', 'actual filechooser interaction'],
  ready_for_upload: false,
};
export const zhihuReadOnlyBindings = {
  // The account link exists only while the profile menu is expanded.
  account: observed(zhihuUrl, '2026-10-06T10:38:23Z', {css: 'a.AppHeaderProfileMenu-item[href*="/people/ren-zhe-ai-chi-yu-52"]', attribute: 'href', encoding: 'zhihu_profile_href'}),
  profileMenu: observed(zhihuUrl, '2026-10-06T09:55:11Z', {css: 'button.AppHeader-profileEntry', identity: {tag: 'BUTTON', type: 'button'}}),
  account_requires_menu_observation: true,
  title: observed(zhihuUrl, '2026-10-06T09:54:32Z', {placeholder: '请输入标题（最多 100 个字）'}),
  body: observed(zhihuUrl, '2026-10-06T09:55:11Z', {css: '.public-DraftEditor-content[contenteditable="true"][role="textbox"]', dom_kind: 'zhihu_draftjs_v1', image_css: 'figure img.Image--isBlock'}),
  textBlocks: observed(zhihuUrl, '2026-10-06T09:56:08Z', {css: '.public-DraftEditor-content[contenteditable="true"] [data-block="true"]:not(figure)'}),
  captions: observed(zhihuUrl, '2026-10-06T09:55:11Z', {css: '.public-DraftEditor-content figcaption.Image-caption'}),
  coverImage: observed(zhihuUrl, '2026-10-06T09:56:08Z', {css: 'img[alt="封面图"]'}),
  importEntrance: observed(zhihuUrl, '2026-10-06T10:35:36Z', {role: 'button', name: '导入', identity: {tag: 'BUTTON', type: 'button', aria_label: '导入', title: null}, observed_visible: true}),
  importInputObservedOnly: observed(zhihuUrl, '2026-10-06T10:39:28Z', {css: 'input[type="file"][accept*=".docx"]', identity: {tag: 'INPUT', type: 'file'}, observed_visible: false, is_chooser_trigger: false}),
  coverInputObservedOnly: observed(zhihuUrl, '2026-10-06T10:39:28Z', {css: 'label.UploadPicture-wrapper > input.UploadPicture-input[type="file"]', identity: {tag: 'INPUT', type: 'file'}, observed_visible: false, is_chooser_trigger: false}),
  coverReplaceObservedOnly: observed(zhihuUrl, '2026-10-06T10:39:28Z', {role: 'button', name: '更换', identity: {tag: 'BUTTON', type: 'button', title: '更换', aria_label: null}, observed_visible_before_hover: false, observed_visible_after_cover_hover: true, chooser_interaction_verified: false}),
  draftStatusObservedOnly: observed(zhihuUrl, '2026-10-06T10:39:28Z', {css: '.DraftStatusTip', observed_text: '刚刚 · 草稿', positive_cloud_check_dom: 'svg.ZDI--CloudCheck24', observed_cloud_check_count: 1, observed_visible: true}),
  observed_state: {raw_nonfigure_blocks: 40, newline_normalized_paragraphs: 55, body_matches_historical_receipt: true, body_images: 22, body_images_loaded_at_observation: 2, placeholder_caption_count: 22, nonplaceholder_captions: 0, independent_cover_count: 1, independent_cover_loaded: true},
  reader_requirements: ['Draft.js div[data-block=true] has real newline-separated original paragraphs', 'figcaption.Image-caption.is-placeholder is UI placeholder only when exact observed placeholder text and class both match; real captions must still block', 'profile menu link must be freshly observed before account-sensitive steps'],
  missing: ['import/cover file inputs currently hidden; chooser trigger is not action-verified', 'actual import/cover chooser trigger interaction', 'all-body-image lazy-load proof', 'Draft.js/caption reader is offline-tested only; no new live runtime validation'],
  ready_for_upload: false,
};
