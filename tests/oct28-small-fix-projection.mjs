// Independent, closed inverse for the two reviewed UI refinements,
// plus the QuietSync layer that maps the restored live/site-five/night
// product bytes back to the small-fix product before the older inverses run.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

export const smallFixBaseline='0dbeffcd6060d12d770a436b00a7caa924d1efec';
export const smallFixProduct='bcb0dc48ae67797023b5c53162e3d4bbf44ac2d2';
export const smallFixHashes=Object.freeze({
  '.ci/public-assets.json':'115e5adbbe7a8c1101d37d643b6a83946c1496f12a1fba432f1a8251b480e748',
  'public/app.js':'758c6c4db956a5faa47c4ef4dd51915b4c21e2e8311835cf14fef2694c20b0d0',
  'public/index.html':'dcc62b60a14bbb27c6845a6cb942e01f2a23b37573d207ecac29ccbf032300e7',
  'public/sw.js':'fc0269be10c9eadcede7420fcaa02457b49d3bf15d752bd96a68adaa876894cd',
  'public/tokens.css':'ea9b64c41d23e09a6bf9f212b009aaa467e6d6e47394edd8b25f710143b46533',
  'public/workbench.css':'7ec0a96429c31de1b731dc1a33237849edb11a888d3605e8f7d4a61b69404254',
  'tests/daily-todos-ui.test.mjs':'f0d9d6371d2bc2a2d6d166788be841b607cab76c34fd7510a0aba008d9f23a15',
  'web/pages/daily-notes.mjs':'b37808af380bb77a2a725765534f6a85bac8f01034b9ede98db6aa3c37cd49bd',
  'web/pages/todos.mjs':'8ba630c84fa9f245898bf74b61816059ee306ee377d7581b4da956c2c5c989ea'
});
/** Live-site restore + site-five + night-review product, inverted to smallFixProduct. */
export const quietSyncBaseline=smallFixProduct;
export const quietSyncHashes=Object.freeze({
  ".ci/public-assets.json":"b39fb3211dbc10d4e829cab8d6e06c40753b5e9d8e678ffbedb380ec40b6a759",
  ".github/scripts/cloudflare-publish.mjs":"a65a15fa31c89048c8b5c6eb455f0ea70b32d9adcdda048d3640cb5c088002ec",
  ".github/scripts/release-policy.mjs":"fac0f436d710f9f7a81bb3e117ce7b193fd6ee6e9e1362a43dd4a235574f3011",
  ".github/workflows/ci.yml":"fb8c9112ad6af67c86eed891466bd6a38af109371100d91d708c97bb7a8bf1c7",
  ".github/workflows/cloudflare-manual-release.yml":"f1bd292b723cb29eb6ff2984fc0941e1eebf72d8d9162435b3984683f33b9329",
  "db/schema.ts":"fccabaae5519e1e00b40cc5718458c071caa614afef3a150e4a64130564ea474",
  "drizzle/meta/_journal.json":"6d716073b710fd3e9b0e7e4b809704fe90d4d9bceea7a6e61e0cac4d17a00084",
  "package.json":"0632f9dbaebdd60a81ea47eb888aee75ade70dbe9e407ac7c3ae9d3b45153d5d",
  "public/api-docs.html":"9ad53bf4c42769bb4f9e9b80357091385ff6e4e9141480e15347fd38e0c88291",
  "public/app.js":"2749b23d2abe0d87033682beb691ed68334d77ae3268aa554f60ffcce6b9afe5",
  "public/glass.css":"571e37644b7e1e55b039f1d4da2e00173a10b1c91ba00c96148bb2872ae1efba",
  "public/index.html":"e780cfe089a3bbdd13bdfa98ab530dbccbf37b54d362b2336ecb5c92c7c8d2e2",
  "public/llms.txt":"e10e7c8d776502752a5df888181948ad40935627e38fdf6469caee32212306be",
  "public/memos.css":"2b655731e5de30606deb9b3183d579b5f01d76f736ca625bdb04453e258ed897",
  "public/mobile.css":"ce1da77686ff4e114139a258c1d2c80bc6f2a844544cea828eccc135d08424a0",
  "public/offline.css":"ceb710bb10d345409d0437274dc1dd79c5152b1de874c7c10f290edc0f21ed7c",
  "public/openapi.json":"4848e4f828347735e99a735608c84436efaad79ac7aaa8080d5f7a214adbf3a5",
  "public/robots.txt":"8d387d977fcbea0725809ab62db2afb774ea755fcf35acbae2b63ef6ea680007",
  "public/style.css":"5e74ba0d858b355eee1329d3271fa3c66cbaaaa5bb378f553f3a69a7b374d6ba",
  "public/sw.js":"2372d9c798bbe5ef2e107f3da37d3e806c799939d67e796bce5c3e1c4524bbe3",
  "public/tokens.css":"9613bcbaba412086d86e006f8178dcc23682f35bcaf515d9e43f7bc78b75af02",
  "public/workbench.css":"5ce77aca77eb7edd1cac6e4b2b52fd1db3c09323f3c3dcf38804aece949f4279",
  "scripts/build.mjs":"0279068fe4a0a0fcd3910d0ab362896b633dd9ae59762d7d78463858592d18af",
  "scripts/migration-contract.mjs":"1cb6573fab64f8ff5358920bb8db3f4e882adaa5de0b07aac40993bda797c5e2",
  "scripts/migration-inventory.mjs":"504477b8773342082b879a806943ca4786c6f9a310c6a288a18646c6a3b68fd5",
  "src/backup.mjs":"ba41b2a6818aa59a30e7770c24f3d313006b15192e5b1cea98529db43aaf002a",
  "src/business-snapshot.mjs":"647b58ee46b44af28fd90f61cdb5e8598dbd4ddc7c69e1211e95530728cb8317",
  "src/lib/request-trace.mjs":"2048516f4607c4cb3c2b7c87157ff58878bd96e386d9fd58d95b703847de8481",
  "src/memos.mjs":"bada043bbcb22220a3901c70598c3b02463db6f0eb24ead641677854f8ae292d",
  "src/note-entries.mjs":"f0d8e6b14a312b04026bdaf6ad9fba0c2b76b1488e539bea6574ec741976aa3b",
  "src/note-entry-validation.mjs":"7722345e648be29c90d0963a13a535aded2d2793e47778392083c8ad470c2e84",
  "src/note-labels.mjs":"95a47911dd018f578f61f804a562d85af062a8b877e69707c966cecc67dc5ce5",
  "src/note-month.mjs":"ac98a5db009bfa44cb3aeb53d028bc1157399003bb8e962e7e111c0c7e1d0dcf",
  "src/public-business.mjs":"40bf4251d7b5f80244d65ff2afc3f53932f45a981981de8fa5aa444481569d94",
  "src/public-note-access.mjs":"70bddf4960df9010e033c0d1c6b4e3786b4e599bfd3811b86c21728530c9ac6b",
  "src/records.mjs":"d7a5a4f329b1c8fcae7eb757f0e23d00f524ffe9a119ac6fe0a16b16b6ec0291",
  "src/snapshot-projection.mjs":"47ed973356193b645e8aea0f74c9186fece6f64bf367330b2e38d6ac166d1cbe",
  "src/todo-templates.mjs":"ae4b740e19221cd8fdc2137f0aeb1606ae49a4a986dbbb22a671b3d21a403732",
  "src/todos.mjs":"70ae58813421eaa0b13a3da01d3dba318aa1876f1ca21763927e8ab8eacddd74",
  "src/unscheduled-todos.mjs":"6198fba1d3ed14e241d8a73c9be8c6fbdfeffb8127856ce366b1c361dbe6f1e1",
  "src/workbench-snapshot.mjs":"76a98aa12d42bd03797886c10d4000aa076794b99658b9df3fa6c1efcefcc36f",
  "src/worker.mjs":"ddab1659690d4d2c4fd9b3c15f159f5456085e9aaef77bb0eb5d27de15c616fc",
  "web/actions.mjs":"85f2b97dceb07e5e4be816f12218448293723f70505612f22fffa2add3d5758f",
  "web/controller.mjs":"926e140738198ea08427075358dfba5d486e5e70874de4345b650b7c030c8e1e",
  "web/core/api.mjs":"8e60879851ded8e6a80eef9aff8befba57fe5eb687e09765199cd5c0262fe9d6",
  "web/core/constants.mjs":"60892700e36ca2488b76ff0b2f9d6eb19abe77ba23b0c5dcad557bc19e97e132",
  "web/core/note-entries-state.mjs":"c96d9e24dfb57ef600eb7fb825d1ca43bb1b2bec67cd1931f3eea10a8e138d38",
  "web/core/notes-editor-view.mjs":"af1106de066891c7ba356e635522e2c84562660af39a5cc9f7c907cd038ecbf1",
  "web/core/notes-month.mjs":"9cb1c3c1708c83dfa98e5adcc640e28d7f2d7162134d9b6fde1b6cb0f59b3679",
  "web/core/router.mjs":"1ab97b40c2bb4f58d11fbeb186c2e96d9d06f6da35e36b72adb439b905c988f7",
  "web/core/state.mjs":"97291d2534155e389aa6ea134703df2db619c0de87e1f075ca09a3c9db870f5a",
  "web/core/todos-state.mjs":"1526e500cc599fae6cadf76a320b4b1f1e8723fe8be5d6a9dd1744a1d8c2a99b",
  "web/daily-notes-controller.mjs":"01d89d4298256d2fda40d99e2ab793171527e877e18797942361c586c804346d",
  "web/events.mjs":"f4c71603874040456d010ed26dacf2c41202c950596f762a263575b9311d8466",
  "web/forms.mjs":"01b25ec3d19db76410082d99b08bbdbd7e7d937daa2dcac1aaaa344e5f97ef2a",
  "web/memos-controller.mjs":"90cbfda2b172279110a04aa1ee90b0785dfea153f80c64fccee9f094122e86ec",
  "web/offline/drafts.mjs":"54eb8a3bcefe09372ca6bab44f76f6fd0f50b0ddc7194ecf7190055cec505c4c",
  "web/offline/note-mutations.mjs":"10cf991d950273054f5e29c0f4fa4944c7a7914579260d354ef78ec2c18deba5",
  "web/offline/notes.mjs":"8eb418a85bd3e8bd1d2ab5caf3b614fd4c3c586ecd3b9e8340cdc6099449cffd",
  "web/offline/outbox.mjs":"bfb4c95adfbccd68a446e01b0beec7462863834c4e3d8c1cc0c7fbbf31f0d5ab",
  "web/offline/read-only.mjs":"a50637a28f884d37e48f2d31ff9d493aacda079c99a255f4291ad888a4ea4e6e",
  "web/offline/runtime.mjs":"4f5459499b5460d6a45aa8970c829d220143f377bc2aa1af4e67e1fdf680c221",
  "web/offline/sw-client.mjs":"b8284c7775cb7fb008c5055b940fcd5d37874f7bcc6d0b54fb9aaeb812bc91d6",
  "web/offline/ui.mjs":"04c51c6af6b450bb905f11a41ad2dd813403890b1b3e9fc95383951416b22daa",
  "web/pages/article-verification.mjs":"5cf3d8419aed6df1527a83135312160b06e219130df70aeec52cff9f8fc1ca62",
  "web/pages/articles.mjs":"6a6650c3215ec5249dd74467fcc78d6f8ec110493f7c6d679cd00c1ce140998d",
  "web/pages/daily-notes.mjs":"b796c72205e5a451af227d99c729f0099136df80804eb771c1b7da2032749a50",
  "web/pages/dashboard.mjs":"19c49ecdb6be4d33420288cb0c6f1854c8c2a9f86c235f7a54817fffad572b16",
  "web/pages/login.mjs":"e2ac3881d7435188cdc3870a49bebc3f511246dd6e2eb01289cd09c2ce7c1056",
  "web/pages/memos.mjs":"2ef51ab240187276f917c112c2ba461e2cccde82c840f9af36119ed67d80541d",
  "web/pages/reviews.mjs":"573ce10087d5db61e5a8f672f1a663bc84ce6191cdbf4475f848535f17c9705c",
  "web/pages/settings.mjs":"b3c81d2bc760d24cd249b4675342665399ec87ee28eb7711af1128d79432d8e3",
  "web/pages/todo-actions.mjs":"03d1f1e949a595985f7176d959974b1ade9268cdf348770bd84b05a2459ff6b3",
  "web/pages/todo-preferences.mjs":"bbda832929a298985851322cb8ca29053ed933b3d62904af1f4805c707ced77c",
  "web/pages/todo-templates.mjs":"ebfb8a68d4c655055af9010b4e326be66647b5e652481a458dd7601f5ebcba72",
  "web/pages/todos.mjs":"071a5cb2f3489605a4562455c88f4e97a7d8dc46ff4235a32bf225c9f05f1893",
  "web/pages/unscheduled-todos.mjs":"9018378bdbdc9a9f0efadd3881924cb3916a0afbf176d5b65f9b9b8c246ea6cf",
  "web/pages/work-reminders.mjs":"c7fdb297583a047855afa49b2e974b12e71dae674170818a600fb189faf8e0d2",
  "web/pages/workbench-settings.mjs":"61950d4951c4b7d2361a1907ec4a7e4e0cbe00fe340d0ea24bcb1962ce241420",
  "web/ui/components.mjs":"5583bab87c60cf13b00b98b2c832d7d01c7b99f354017fe57fbf7e3bd9dcbed6",
  "web/ui/workbench.mjs":"e4f4bfbbf96bf2da19ac9aacadd7556f0eeb81845039fcd77b62498144339266",
  "tests/daily-todos-ui.test.mjs":"371751584de02beaa434843b74404e23a70dd787434caab80cfd9232b0c37ac2"
})
const root=new URL('../',import.meta.url);
const hash=s=>createHash('sha256').update(s).digest('hex');
const show=(commit,file)=>execFileSync('git',['show',commit+':'+file],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
const before=f=>show(smallFixBaseline,f);
const quietBefore=f=>show(quietSyncBaseline,f);
export const isSmallFixProduct=(file,source)=>Object.hasOwn(smallFixHashes,file)&&hash(source)===smallFixHashes[file];
export const isQuietSyncProduct=(file,source)=>Object.hasOwn(quietSyncHashes,file)&&hash(source)===quietSyncHashes[file];
export function projectSmallFix(file,source) {
  if(!Object.hasOwn(smallFixHashes,file))return source;
  const old=before(file);
  if(source===old)return source;
  assert.ok(isSmallFixProduct(file,source),'exact approved small UI fix bytes: '+file);
  return old;
}
/** Invert restored live / site-five / night-review product bytes to the small-fix product.
 *  Unrecognized digests pass through so older projection layers can keep using historical intermediates. */
export function projectQuietSync(file,source) {
  if(!Object.hasOwn(quietSyncHashes,file))return source;
  const old=quietBefore(file);
  if(source===old)return source;
  if(hash(source)===quietSyncHashes[file])return old;
  return source;
}
