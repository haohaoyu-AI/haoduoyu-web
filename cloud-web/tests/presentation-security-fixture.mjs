// Public synthetic values only. IDs have official URL shapes, never real drafts.
export const syntheticDraftLinks={
 toutiao:'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=900000000000001',
 zhihu:'https://zhuanlan.zhihu.com/p/900000000000002/edit',
};
export const hiddenDiagnostic='详细记录已保留，原始诊断不在页面展示。';
export const diagnosticProbes=[
 'Authorization: Bearer synthetic-secret','claim_token=synthetic-secret',
 'Cookie: synthetic-secret','password=synthetic-secret','api_key=synthetic-secret',
 'session=synthetic-secret','jwt=synthetic-secret','sig=synthetic-secret',
 'credential=synthetic-secret','access_key=synthetic-secret',
 String.raw`{"session":"\u0073ynthetic\u002dsecret"}`,
 encodeURIComponent('session=synthetic-secret'),
 encodeURIComponent(encodeURIComponent('jwt=synthetic-secret')),
 '% session=synthetic-secret',
 'unrecognized public diagnostic prose',
];
export const forbiddenDraftLinks=[
 'https://example.com/draft',
 syntheticDraftLinks.toutiao.replace('https:','http:'),
 syntheticDraftLinks.toutiao.replace('mp.toutiao.com','mp.toutiao.com.evil.example'),
 syntheticDraftLinks.zhihu.replace('zhuanlan.zhihu.com','evil.example'),
 syntheticDraftLinks.toutiao.replace('mp.toutiao.com','user:synthetic-secret@mp.toutiao.com'),
 syntheticDraftLinks.zhihu.replace('zhuanlan.zhihu.com','zhuanlan.zhihu.com:443'),
 syntheticDraftLinks.toutiao+'#session=synthetic-secret',
 syntheticDraftLinks.zhihu+'?session=synthetic-secret',
 ...['token','session','jwt','sig','credential','access_key','unknown','pgc_id'].map(key=>syntheticDraftLinks.toutiao+'&'+key+'=synthetic-secret'),
 syntheticDraftLinks.toutiao.replace('pgc_id','%70gc_id'),
 syntheticDraftLinks.toutiao.replace('900000000000001','%39'+'00000000000001'),
 syntheticDraftLinks.toutiao+'&%2574oken=opaque',
 syntheticDraftLinks.zhihu+'%',
 syntheticDraftLinks.zhihu+'#',
 ' '+syntheticDraftLinks.zhihu,
 syntheticDraftLinks.zhihu+'\n',
 syntheticDraftLinks.zhihu.replace('/p/','/p\\/'),
 syntheticDraftLinks.zhihu.replace('/edit','/edit/'),
 syntheticDraftLinks.zhihu.replace('900000000000002','synthetic-secret'),
 syntheticDraftLinks.toutiao.replace('900000000000001','１２３'),
];
