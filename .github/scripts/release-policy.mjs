import {createHash} from 'node:crypto';
import {readFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

class PolicyFailure extends Error {}
const deny=message=>{throw new PolicyFailure(message);};
export const repository='haohaoyu-AI/haoduoyu-web';
export const releases=Object.freeze({
  '947bc782ea70e7808f6e7de523e5977818b292df':Object.freeze({
    ci:40291598628,bytes:1244002,sha256:'3c106a1a3bbd570d72f3784970a09af09caec653ffa9869550649d1144e43de0',label:'round6'}),
  '16ff80ef2d857676d81b7c219110c820de5af72b':Object.freeze({
    ci:40269439403,bytes:1269372,sha256:'61e30101b744f56bfe10418cb536b661e9bac5ca8270041b510f6222434c4149',label:'round5-rollback'})
});
export const productionRestore=Object.freeze({
  commit:'b35dd510aec0fe67a88aa02edabcd73bfda9b33f',
  tree:'6b3daff954b41ce78654d3832863dab800a1494a',
  baseline:'3bd46508-c1fd-4845-af7d-93afc85b7d31',
  bytes:2680619,sha256:'f5271840e542b7d133b5e996a198e1c0a8387ef3ca6c4d45cdb5193dbfffa2eb',
  label:'production-review-collapse-20261108'});
// The exact previous artifact is available from the independently verified mobile release.
export const previousProductionRelease=Object.freeze({
  commit:'2627fc1f52e426169a5c8bc9939c5d74e8c7a24d',
  tree:'449c3df468d03f9ee1534451fcf4b7f8d8bf4b82',
  baseline:'d0a6a92b-9047-44aa-8e1f-36f7d01aed54',
  originalBaseline:'808dbbdd-1a51-428d-9d92-54954dc05526',
  bytes:2675441,sha256:'cc810985a976267f027bfc917477e8994c9577cdeea43e224a5805ba86ac241a',
  label:'production-mobile-review-20261108'});
// Exact feature source; its additive D1 schema was applied separately before release.
export const openaiReviewRelease=Object.freeze({
  commit:'5044ed66af80f9593879453d23c88c3851a06f12',
  tree:'a80a139cc4d71bc24a246c6805cd449d8842a882',
  baseline:'aa6a7a87-4a7a-4765-902a-ae727d6ed259',
  bytes:2783657,sha256:'231a4fd783cf05611290b74d9fbc45c3be6903f7ec73749ad96eae3017cf16f0',
  label:'production-ai-diagnosis-runtime-repair-20261108'});
// Exact remote candidate/tree verified against isolated browser acceptance.
// Fixed production v95 entrypoint bytes independently match source 1c7b8b0:
// 2818733 bytes, SHA256 256722179e6ba26a4bc6c98e1dd6608eaae7acee3780d687d3fc86fbb988056a.
// The existing runtime guard still rechecks the active version and inherited bindings.
export const dataTrendsRelease=Object.freeze({
  commit:'334e00d676452cc47e044cb4f88f8209b1c411b0',
  tree:'b369353b7932880d80bae5b28e1a880b34929f0c',
  baseline:'4d874ca9-ede5-4e03-a7e5-ef3c1bc0babd',
  bytes:2844076,sha256:'f6ca099166856484fcff442aa56b5904cebb76b323b10978b8f38bc50fa56325',
  label:'production-data-trends-20261110'});
// Robots-only patch on the exact current data-trends production source.
// Runtime bindings, authentication, database and Cloudflare settings are unchanged.
export const claudeRobotsRelease=Object.freeze({
  commit:'52f5f32f29526b302e0f58bf3272f2d636f782a4',
  tree:'1f6a81efb262487d0051258179e643ea1ebb6393',
  baseline:'a9dde039-ee54-4b54-9eb6-495cdcee3956',
  bytes:2844394,sha256:'76650eec2aa59bc5ab5d4ccb7d5c1681718859b4b8118d02886abafa790e10b4',
  label:'production-claude-public-robots-20261110'});
// Exact PR46 presentation-only source; inherits existing production bindings and guards.
export const claudeTrendsRelease=Object.freeze({
  commit:'e993885c752e97532214ef14a2fcf32b324bc08c',
  tree:'c1cde2cf59de1dddc28cc9e5a3401b72bea2871f',
  baseline:'c0b4f9c0-810f-45dd-ab1b-17ca3a54f750',
  bytes:2852117,sha256:'e2d26a1967a346c9a6d78f088945467359fee3dddede6f48027a307470de2651',
  label:'production-claude-review-trends-20261111'});
// Exact daily-notes retained-draft fix on top of the deployed PR46 source; frontend only, inherits bindings and guards.
export const claudeNotesDraftsRelease=Object.freeze({
  commit:'bc8449887e6b88f11b05ccbed13613f2f34e9b57',
  tree:'7c7f9bd1345db9cfa8b6e47e218c5f0390389d69',
  baseline:'b0d087c9-0713-45b0-bbed-2cde9e100c16',
  bytes:2857206,sha256:'62994011a7d233ce396248ca9a610f0b1eaa6a374aef9c3d56c157df0cfac2fb',
  label:'production-claude-notes-drafts-20261111'});
// Combined rules/prompts and Claude retained-draft source, with existing live features preserved.
// Apply and verify the separately reviewed 0021 D1 migration before dispatch.
export const reviewRulesPromptsRelease=Object.freeze({
  commit:'d715770a7753ea70931b330ce297fd566af6f0dd',
  tree:'4281cb471b94c392f823ac595b8f88c805a279a1',
  baseline:'1a68c912-b532-4719-b4ec-e06afbe7e46a',
  bytes:2919290,sha256:'a2649c03a40db81773545f2d131ace8bf58ac80b2681b033f331836cb889e436',
  label:'production-combined-review-rules-claude-drafts-20261111'});
// Exact approved site-upgrade source. Apply and verify 0022 and 0023 on production D1 before dispatch.
export const siteFiveUpgradesRelease=Object.freeze({
  commit:'58ac4a201e5a3a0e9107d077c3642997b09ece07',
  tree:'b9aec25fd79d9bc195f1c2eaee02134976a54fe4',
  baseline:'a9efcff1-4876-40ff-b4c3-b23cf5846543',
  bytes:2946480,sha256:'31e52a9001f33e0d13fa78eddac4202cb6cab4c46e71e4a9f6a6ce8c9730106d',
  label:'production-site-five-upgrades-20261111'});
// Exact approved night-review source. Apply and verify 0024 on production D1 before dispatch.
export const nightReviewTwelveRelease=Object.freeze({
  commit:'3f4789dbe1994508ed89d15e472613e91b94fb87',
  tree:'bb54dc9ec7ea995060ee4bd055c5bbf96e7890e0',
  baseline:'fd2185c8-4114-45a4-bd32-f1e71119dfbd',
  bytes:2943560,sha256:'2a98bb9300978b6219756009aa44a1ec3c4af323b157649fc2ec0417340a3462',
  label:'production-night-review-twelve-20261112'});
// Exact chart-restoration source, independently rebuilt without production writes.
// Expected v102 baseline comes from successful run 43113806310/job 130836462978,
// DEPLOYMENT_CONFIRMED at 2026-11-11T22:41:23.7569521Z; not a live production read.
// The unchanged publisher must recheck the actual active/latest version before writes.
export const chartRestoreRelease=Object.freeze({
  commit:'ae90dc9148ce7d579714ad245f26d6829f1a556b',
  tree:'b498bbd131b1e59fd03fcc34786009b8a1169312',
  baseline:'b1a7f54e-41cc-416e-b027-c54cdcd41621',
  bytes:2966551,sha256:'f340427433c45bcb0a0dcd0ee31bccc434524c2149e152c8e59b3cf8c034799a',
  label:'production-dashboard-chart-restore-20261112'});
// Six upgrades (counted to-dos, compact score, review text, AI weekly loop) stacked on the deployed chart-restore source.
// No migration, binding or wrangler change. Baseline is the version uploaded by successful run 43145436661
// (DEPLOYMENT_CONFIRMED for ae90dc9); the publisher still rechecks the live version before writing.
export const sixUpgradesRelease=Object.freeze({
  commit:'75e2db9a05fd04cb873c1f41046a9ad14dfbf01e',
  tree:'218aaab30fe8e43306cf9e08ee25127baba649a1',
  baseline:'afb86c5e-6a63-448c-b1ac-9e6470d68e3a',
  bytes:3054674,sha256:'013bceaae5a2bd85381fba1e8d63d3dfc0361e76605474aeef4f4d700a2728c0',
  label:'production-six-upgrades-20261112'});
// Follow-up to the six upgrades: readable names for rule codes and a baseline for pre-existing candidate rules.
// Baseline is the version uploaded by successful run 43181992990 (DEPLOYMENT_CONFIRMED for 75e2db9).
export const reviewAiNamesRelease=Object.freeze({
  commit:'3528ad571af87b243f479611d4a049cb83ee1fa7',
  tree:'0da628fa632d2ac4b20fc5aac0a59111c9b45386',
  baseline:'f5dc58f5-30f5-46af-86d0-6dcc70e3a2ff',
  bytes:3058658,sha256:'d853f3c10213f4c2428204f0aafdb232a09df1a5565d156166c956dcd7496dfe',
  label:'production-review-ai-names-20261112'});
// One-line follow-up: AI pattern names are stored whole. Baseline is the version uploaded by run 43183633923.
export const patternNamesWholeRelease=Object.freeze({
  commit:'3584b78760770487feb8bf65ad2cbaee79d93aae',
  tree:'da512b191174c47353104d87c11a685f683bab8d',
  baseline:'50b3d721-0549-4660-b58d-256543b9a406',
  bytes:3058658,sha256:'8fceb6512bfbe89cfe7acc357cffdd1726a2d869c0cdda0a5833483dd8beaeac',
  label:'production-pattern-names-whole-20261112'});
// Title patterns shown by example title, duplicate spellings merged. Baseline is the version uploaded by run 43185724050.
export const patternExamplesRelease=Object.freeze({
  commit:'3fad099ae38fd2043ad398bedf9b0041af9ba082',
  tree:'46ed2c7141c8f7a6714fa3648c91366ad2f8b8f5',
  baseline:'be38aa14-16a7-4942-beb3-d2a1108e31ff',
  bytes:3062847,sha256:'85a1f4bfafec05ff8d39b7fa6391aff79c57c8049f56b555fc1af15da79e978c',
  label:'production-pattern-examples-20261112'});
// Unified AI reports on the exact deployed title-pattern source; no D1 or binding changes.
export const unifiedAiReportsRelease=Object.freeze({
  commit:'9835ad1308b75656c29d234a82fb046d61934817',
  tree:'644a97f21ed732387b42fb59f44ca3768596d143',
  baseline:'7f460fad-6aad-4550-bf32-3f8821dc32e4',
  bytes:3055215,sha256:'2344f363b04e83de2072b7c3ebca6bb61e628a4873b9421c0f02aa1a9697d960',
  label:'production-unified-ai-reports-20261112'});
// Event wiring only, on the exact unified AI reports version confirmed in production.
export const aiReportModelOptionsRelease=Object.freeze({
  commit:'b6f8af9dfeac65f34e40388c356a850a226a2a51',
  tree:'dc9a71a0789724359c124fa46b767675186559a4',
  baseline:'25c4c7ae-6e9e-4646-9896-74d5b47cfa30',
  bytes:3055386,sha256:'f3cd419d69aa87a8166f6ffe0f3917efefd73b0eaa3cc1ebc9803bba776bbb49',
  label:'production-ai-report-model-options-20261112'});
// Removes the experiment cards, title patterns and headline breakdown on top of the deployed b6f8af9.
// Baseline is the version uploaded by successful run 43268792694 (DEPLOYMENT_CONFIRMED for b6f8af9).
export const removeAnalysisRelease=Object.freeze({
  commit:'9ec99b201ae1438684b5b79e5caa9b13fc2988f9',
  tree:'494d6707df005f1dd1efa928e0c303526be9d421',
  baseline:'c7a663ad-c502-4ede-b068-bffda6d2d617',
  bytes:3045533,sha256:'4340a7525ab703475063b0215331d9eb255af061f6768bd43be1df2fbf84cf9d',
  label:'production-remove-analysis-20261113'});
// To-do counter fixes on top of the deployed 9ec99b2. Baseline is the version uploaded by run 43379262582.
export const todoCountFixesRelease=Object.freeze({
  commit:'e407cabf98f8b3e5ad1215fc7c8d915204443b10',
  tree:'bbaf06721b573c94387b8054a24248a650d4eba8',
  baseline:'b8d744ce-94c5-4d14-8330-6ee45abeb52b',
  bytes:3046801,sha256:'6ef13de15ca585f52187d02255fab4fbf91de960fd969c94ee4aadcfe8a23fda',
  label:'production-todo-count-fixes-20261113'});
// Article list grouped by bot-filled pattern tags, on top of the deployed e407cab. Baseline: run 43380718316's upload.
export const articlePatternViewsRelease=Object.freeze({
  commit:'003f01e77fe7572a1b38161e59503ac7c9d477d0',
  tree:'fa50c4f20079e8b69e1de9869d024afbdbce884d',
  baseline:'fb1090ac-0dd6-41a7-826a-0470d7088f51',
  bytes:3055102,sha256:'d2efe52da19576e3d3b07d7b3a59ca7caff4b126fc631ec0ac9564e757547c47',
  label:'production-article-pattern-views-20261113'});
// Click and review-load speed-up on top of the deployed 003f01e. Baseline: run 43382705028's upload.
export const speedUpRelease=Object.freeze({
  commit:'e7499bd4d1b1f537636b2fb00b0dcf1199ab70cc',
  tree:'f5f9f53c1706d6e4ef3daa1b0a4ca57539d52127',
  baseline:'73703900-9614-4349-822b-cae862287fef',
  bytes:3058520,sha256:'f44da1a42999d3e16a54ae6ddf3bcfe56422c9f17f1e4340ef06b682a5a55faf',
  label:'production-speed-up-20261113'});
// Recent-first resumable pulls on the deployed speed-up source; no migration or binding changes.
export const progressiveOfflineRelease=Object.freeze({
  commit:'b05613792693d88a1b081e511eaf95cca08d5459',
  tree:'1b0924e5deaf7d89ca7ba6f449d560d817e159fb',
  baseline:'ab1beb48-453c-4d06-84b8-62d3c5fad69b',
  // Exact upload from run 43412140798; GET briefly returned 404 before deployment.
  uploadedVersion:'a9c883c8-8f35-4dd1-afeb-f129422d33e4',
  bytes:3068718,sha256:'bdb24edc4e53f0cf3437e75f0b6b3cef652fb0ca5a4cbe48166f95a86f3b7864',
  label:'production-progressive-offline-sync-20261113'});
// To-do carry-forward and the weekly bowel/bladder summary, on top of the deployed b056137. Baseline: run 43412881992's deployed version.
export const carryBodySummaryRelease=Object.freeze({
  commit:'c776a8816861605f9d43bdc91fbc0a79cbec67b6',
  tree:'1741ca0e8b4eb273563ffa2c26c81d5e321d4e3a',
  baseline:'a9c883c8-8f35-4dd1-afeb-f129422d33e4',
  bytes:3098471,sha256:'cc763b2239a094ea9599009541face43a2656693ae324217bc93c8d34ccfdb3b',
  label:'production-carry-body-summary-20261113'});
// Weekly summary averages only weeks with records, on top of the deployed c776a88. Baseline: run 43454849311's deployed version.
export const summaryAverageRelease=Object.freeze({
  commit:'c0df37d8a691820a1598e1a55a72af2a932ae9a3',
  tree:'7146c491abf54ba2586f42396a1aed85438e8b26',
  baseline:'c3b18ec2-ca4f-474c-9e23-829e33e55d56',
  bytes:3099366,sha256:'5b131c4334e2a55d43b9b2aa7b84bdcf28f07486ae3560f10634661ccb5386f7',
  label:'production-summary-average-20261114'});
// Bounded offline reads preserve all deployed c0df37d features and Smart Placement.
export const boundedOfflineRelease=Object.freeze({
  commit:'8fa6cc781f5765deb01da12b47f53b00b302d6ce',
  tree:'cfa43720bbcd724c347792ea276e410b79d042e0',
  baseline:'9637f764-633c-4a89-89e8-7a3296477d21',
  bytes:3128436,sha256:'56ba0df89bbbd5b1509e7c0f6439035179f6e59564e6a0c69da62d6fd1bc7136',
  label:'production-bounded-offline-reads-20261114'});
// Read failures no longer lock foreground requests; relaxed public limits. On top of the deployed 8fa6cc7 (run 43463586177).
export const unlockReadsRelease=Object.freeze({
  commit:'d0b13d839449b8a9e62559b69e37abd012906d1a',
  tree:'32fc4f05bdcd05d31d6de918beb71fced262c687',
  baseline:'bdabea90-101b-4950-a90d-6aeb07c6763b',
  bytes:3129221,sha256:'d6046a064ab87cd24206cc12621a238f0c536825c989cb6fd9bec322d1ece527',
  label:'production-unlock-reads-20261114'});
// Tidier notes history and plainer weekly summary, on top of the deployed d0b13d8 (run 43540411314).
export const historyTidyRelease=Object.freeze({
  commit:'24d9380eef7fc387c416d603efa30d3cd593f212',
  tree:'d26c0f310d25ae957a846025a03d5136847a56b1',
  baseline:'dd3ddf89-4e4f-47a8-b8dd-003ac6cbf1ca',
  bytes:3133678,sha256:'25bdd64efe85355cc32218dddb190e5525383ac37736693d55f556569ff90757',
  label:'production-history-tidy-20261114'});
// Weekly summary compares only against whole weeks and explains itself, on top of the deployed 24d9380 (run 43541789296).
export const summaryCompareRelease=Object.freeze({
  commit:'cb90b5dbd864d44a056a27217e412bfd391ab697',
  tree:'91b49629172a2b34323b671a43bccbc28102aca5',
  baseline:'6c9bcf79-c638-44d7-8530-6f426ebf5c70',
  bytes:3135140,sha256:'fcca07252ff3599c4ec4f700cee86f5600b86c07628c2270acbf0e82c977dcaa',
  label:'production-summary-compare-20261114'});
export const pausedProjectReminderRelease=Object.freeze({
  commit:'86d36dda4f80f528da5cf089f018299a0bcb5e53',
  tree:'1bfa784163175243848978fd6dd03806945a56fd',
  baseline:'fd3ea4cc-0ab5-4656-94dc-418e8dffef5f',
  bytes:3135349,sha256:'d4981257ca951628e3fd5ae2cc4f947d94a3e6934fecc545285283c098fd15da',
  label:'production-hide-paused-project-reminders-20261114'});
// Diary-style notes timeline, on top of the deployed 86d36dd (run 43543974757).
export const diaryTimelineRelease=Object.freeze({
  commit:'001cfa5edaa7a1373e78ed08e2f46cad636f1250',
  tree:'cb6991f0e6cde025ee86b9118cd614aace0d17ae',
  baseline:'1e584819-9f44-4479-b04a-63d56289a4d8',
  bytes:3140293,sha256:'6fc8ab9eabda6c61e0d9f88733ffe60ac3124eb5f33a3c0df4efee685b876ecb',
  label:'production-diary-timeline-20261114'});
// Timeline-only notes history, on top of the deployed 001cfa5 (run 43544351531).
export const timelineOnlyRelease=Object.freeze({
  commit:'9fb3aaf0a0c09e3f52473282d6ebe2dbcd965c49',
  tree:'134490cbd3588bc1993efe64897e1f1befd72f9e',
  baseline:'74a81fbe-be68-4a27-9d7f-c681ee063707',
  bytes:3137890,sha256:'6daa2105f6d175082d6f67e0f99fa59d8407597595d8ddcc63a07aa53098e48f',
  // Run 43545024626 uploaded this exact artifact, then deployment hit a transient 404: resume, do not upload again.
  uploadedVersion:'a5c493db-c68a-441e-9e92-12066455ac71',
  label:'production-timeline-only-20261114'});
// AI reports diary timeline, on top of the deployed 9fb3aaf (run 43545149509).
export const aiTimelineRelease=Object.freeze({
  commit:'3b6fadfbe1795c5134eccdcc6a31e03565f591f8',
  tree:'40769a9c6b399d0d3f1ac103723846747c0febfc',
  baseline:'a5c493db-c68a-441e-9e92-12066455ac71',
  bytes:3142860,sha256:'9f7c8bee6e64b6ea4c77415a0a15c4e3e4c8fd6c4c16a62ee2ef3f3e5a8162de',
  label:'production-ai-timeline-20261114'});
// To-do calendar and article publishing in the shared diary design, on top of the deployed 3b6fadf (run 43546897568).
export const unifiedTimelinesRelease=Object.freeze({
  commit:'c61cb41fafc7180e73325e5d27b4212c0348d825',
  tree:'80893167b3707597f71ba041cb142bcd8fbbf059',
  baseline:'005bd44b-2262-4ab2-81d2-cac8391e1156',
  bytes:3149490,sha256:'d87a77e47864b72cc8655869d976587c18c586377373b9254a3975d810968c41',
  label:'production-unified-timelines-20261114'});
// Article list view switch with the timeline by default, on top of the deployed c61cb41 (run 43548169522).
export const articleViewSwitchRelease=Object.freeze({
  commit:'7ec49e8ad3c33cadecba9ee599fed2237d009c9a',
  tree:'1c74a1b2b7690dc0940dd1b6e4d290dba037909a',
  baseline:'d18f5913-49e8-4e65-89f9-23a2d7b149f6',
  bytes:3152465,sha256:'9c88558aa5a1799a35e126a1ea433b552b62335a011b687bfa2400074a9e85fd',
  label:'production-article-view-switch-20261114'});
// 一句话加待办 with a confirm row and the tidied AI model settings, on top of the deployed 7ec49e8 (run 43549188280).
export const todoParseRelease=Object.freeze({
  commit:'3c8f550809843d2dc50026d292b1f141fa308b83',
  tree:'f8b48610f04d5c09f924ada94a2264d99c99c9fe',
  baseline:'61735d16-a668-4adb-94d4-cdf5ce17098f',
  bytes:3169205,sha256:'7151acedba61b0241eb516f5312652df08fd2bec94c9467c1bfaa2b63dee9bf5',
  label:'production-todo-parse-20261114'});
// 一句话加待办: "次数不限" becomes the counter's ∞, on top of the deployed 3c8f550 (run 43554217007).
export const todoUnlimitedRelease=Object.freeze({
  commit:'797289c9981d8f2a2d6e1c21c5880c26969851f2',
  tree:'20ccd24bf8eabb081345aefced61d17ece8877fa',
  baseline:'2b87a67c-529a-4172-bff6-6b8f536c03d4',
  bytes:3169629,sha256:'ca5d308f3cec84a19c5d590af8c8929a18f4a691b18457e0e6c0bdfb2dc4feee',
  label:'production-todo-unlimited-20261114'});
const acceptedRelease=commit=>commit===todoUnlimitedRelease.commit?todoUnlimitedRelease:
  commit===todoParseRelease.commit?todoParseRelease:
  commit===articleViewSwitchRelease.commit?articleViewSwitchRelease:
  commit===unifiedTimelinesRelease.commit?unifiedTimelinesRelease:
  commit===aiTimelineRelease.commit?aiTimelineRelease:
  commit===timelineOnlyRelease.commit?timelineOnlyRelease:
  commit===diaryTimelineRelease.commit?diaryTimelineRelease:
  commit===pausedProjectReminderRelease.commit?pausedProjectReminderRelease:
  commit===summaryCompareRelease.commit?summaryCompareRelease:
  commit===historyTidyRelease.commit?historyTidyRelease:
  commit===unlockReadsRelease.commit?unlockReadsRelease:
  commit===boundedOfflineRelease.commit?boundedOfflineRelease:
  commit===summaryAverageRelease.commit?summaryAverageRelease:
  commit===carryBodySummaryRelease.commit?carryBodySummaryRelease:
  commit===progressiveOfflineRelease.commit?progressiveOfflineRelease:
  commit===speedUpRelease.commit?speedUpRelease:
  commit===articlePatternViewsRelease.commit?articlePatternViewsRelease:
  commit===todoCountFixesRelease.commit?todoCountFixesRelease:
  commit===removeAnalysisRelease.commit?removeAnalysisRelease:
  commit===aiReportModelOptionsRelease.commit?aiReportModelOptionsRelease:
  commit===unifiedAiReportsRelease.commit?unifiedAiReportsRelease:
  commit===patternExamplesRelease.commit?patternExamplesRelease:
  commit===patternNamesWholeRelease.commit?patternNamesWholeRelease:
  commit===reviewAiNamesRelease.commit?reviewAiNamesRelease:
  commit===sixUpgradesRelease.commit?sixUpgradesRelease:
  commit===chartRestoreRelease.commit?chartRestoreRelease:
  commit===nightReviewTwelveRelease.commit?nightReviewTwelveRelease:
  commit===siteFiveUpgradesRelease.commit?siteFiveUpgradesRelease:
  commit===reviewRulesPromptsRelease.commit?reviewRulesPromptsRelease:
  commit===claudeNotesDraftsRelease.commit?claudeNotesDraftsRelease:
  commit===claudeTrendsRelease.commit?claudeTrendsRelease:
  commit===claudeRobotsRelease.commit?claudeRobotsRelease:
  commit===dataTrendsRelease.commit?dataTrendsRelease:
  commit===openaiReviewRelease.commit?openaiReviewRelease:
  commit===productionRestore.commit?productionRestore:
  commit===previousProductionRelease.commit?previousProductionRelease:releases[commit];
function requirePinnedSource(release) {
  if(release.tree&&(!/^[0-9a-f]{40}$/.test(release.commit||'')||!/^[0-9a-f]{40}$/.test(release.tree)))
    deny('The exact verified remote production source commit and tree must be pinned before release.');
  return release;
}
export function validateRequest(env) {
  if(env.GITHUB_REPOSITORY!==repository||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='workflow_dispatch')
    deny('Release requires this repository, main branch and manual workflow_dispatch.');
  if(env.LOCAL_UPLOAD_STOPPED!=='true')deny('Confirm local uploads have stopped and uncertain results have been reconciled.');
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(env.EXPECTED_CURRENT_VERSION||''))
    deny('An explicitly verified current production version UUID is required.');
  const release=acceptedRelease(env.TARGET_COMMIT);
  if(!release)deny('Target commit is not an explicitly approved release or rollback.');
  requirePinnedSource(release);
  if(release.tree&&!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(release.baseline||''))
    deny('The exact production rollback baseline must be pinned before this release can run.');
  if(release.baseline&&env.EXPECTED_CURRENT_VERSION!==release.baseline)
    deny('The production restore requires its exact independently verified baseline version.');
  if(release.uploadedVersion?env.UPLOADED_VERSION!==release.uploadedVersion:Boolean(env.UPLOADED_VERSION))
    deny('Only the exact already-uploaded candidate registered for this release may be resumed.');
  return release;
}
export async function verifyCI(commit,{request=fetch,token}={}) {
  const release=releases[commit];if(!release)deny('Unknown release.');
  const response=await request(`https://api.github.com/repos/${repository}/actions/runs/${release.ci}`,{
    headers:{Accept:'application/vnd.github+json',...(token?{Authorization:`Bearer ${token}`}:{})},
    redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)deny(`Approved CI run lookup failed: HTTP ${response.status}.`);
  const data=await response.json();
  if(data.id!==release.ci||data.head_sha!==commit||data.status!=='completed'||data.conclusion!=='success'||
    data.path!=='.github/workflows/ci.yml'||data.event!=='push'||data.repository?.full_name!==repository)
    deny('The exact approved Foundation CI run has not succeeded for this commit.');
  return release;
}
// This reviewed production-source candidate uses the full-history scan and exact build
// in the release job, rather than the unrelated historical quality-test gate.
// All other releases retain their exact successful Foundation CI requirement.
export async function verifyEligibility(commit,{request=fetch,token}={}) {
  const release=acceptedRelease(commit);if(!release)deny('Unknown release.');
  requirePinnedSource(release);
  if(!release.tree)return verifyCI(commit,{request,token});
  const response=await request(`https://api.github.com/repos/${repository}/git/commits/${commit}`,{
    headers:{Accept:'application/vnd.github+json',...(token?{Authorization:`Bearer ${token}`}:{})},
    redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)deny(`Pinned production source lookup failed: HTTP ${response.status}.`);
  const data=await response.json();
  if(data.sha!==commit||data.tree?.sha!==release.tree)
    deny('The exact recovered production source commit and tree are required.');
  return release;
}
export function verifyWorker(bytes,commit) {
  const release=acceptedRelease(commit);if(!release)deny('Unknown release.');
  requirePinnedSource(release);
  if(bytes.byteLength!==release.bytes||createHash('sha256').update(bytes).digest('hex')!==release.sha256)
    deny('Built Worker does not match the accepted release bytes and SHA-256.');
  return release;
}
async function main() {
  const env=process.env,release=validateRequest(env);
  if(process.argv[2]==='verify') {
    await verifyEligibility(env.TARGET_COMMIT,{token:env.GITHUB_TOKEN});
    if(!env.GITHUB_OUTPUT)deny('GitHub output path is required.');
    await appendFile(env.GITHUB_OUTPUT,`target_commit=${env.TARGET_COMMIT}\nworker_sha256=${release.sha256}\nworker_bytes=${release.bytes}\n`);
    console.log(`Approved ${release.label}: ${env.TARGET_COMMIT}; ${release.tree?'in-run full-history scan and exact artifact required':`CI ${release.ci}`}.`);
  }else if(process.argv[2]==='artifact') {
    verifyWorker(await readFile('source/dist/server/index.js'),env.TARGET_COMMIT);
    console.log(`Worker verified: ${release.bytes} bytes; SHA-256 ${release.sha256}.`);
  }else deny('Unknown release policy command.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(error=>{console.error(error instanceof PolicyFailure?error.message:
    'CI lookup or file verification failed; no Cloudflare upload was attempted.');process.exitCode=1;});
