import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {zipSync,strToU8} from 'fflate';

const require=createRequire(import.meta.url),exports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/article-format.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,TextDecoder,Uint8Array,Set,Error,URL});
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT='application/vnd.openxmlformats-officedocument.wordprocessingml.';
const expected=['原样标题','第一段：标点，空格  不变。','','第二段\t结尾'];
const body='<w:p><w:r><w:t>原样标题</w:t></w:r></w:p><w:p><w:r><w:t>第一段：标点，空格  不变。</w:t></w:r></w:p><w:p/><w:p><w:r><w:t>第二段</w:t><w:tab/><w:t>结尾</w:t></w:r></w:p>';
const complex=(code='PAGE',result=null)=>`<w:r><w:fldChar w:fldCharType="begin"/><w:instrText xml:space="preserve">${code}</w:instrText>${result===null?'':`<w:fldChar w:fldCharType="separate"/><w:t>${result}</w:t>`}<w:fldChar w:fldCharType="end"/></w:r>`;
const wrap=(content,kind='footer')=>`<w:${kind==='footer'?'ftr':'hdr'} xmlns:w="${W}" xmlns:r="${R}">${content}</w:${kind==='footer'?'ftr':'hdr'}>`;
const style=(id,inside='',extra='')=>`<w:style w:type="paragraph" w:styleId="${id}" ${extra}>${inside}</w:style>`;
const styleDoc=(definitions,defaults='')=>`<w:styles xmlns:w="${W}">${defaults}${definitions}</w:styles>`;
const normal=style('Normal','','w:default="1"');
const standardStyles=styleDoc(normal+style('Footer','<w:basedOn w:val="Normal"/>')+style('Header','<w:basedOn w:val="Normal"/>'));
const numbered='<w:pPr><w:numPr><w:numId w:val="99"/></w:numPr></w:pPr>';
const styledEmpty='<w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr></w:p>';
function doc(content,options={}){
 const kind=options.kind||'footer',part=`word/${kind}1.xml`,type=CT+kind+'+xml';
 const files={
  '[Content_Types].xml':`<Types><Override PartName="/word/document.xml" ContentType="${CT}document.main+xml"/>${content===null?'':`<Override PartName="/${part}" ContentType="${type}"/><Override PartName="/word/styles.xml" ContentType="${CT}styles+xml"/>`}${options.contentTypes||''}</Types>`,
  '_rels/.rels':`<Relationships><Relationship Id="main" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
  'word/document.xml':`<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}${options.body||''}${content===null?'':`<w:sectPr><w:${kind}Reference w:type="default" r:id="decoration"/></w:sectPr>`}</w:body></w:document>`,
  'word/_rels/document.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${content===null?'':`<Relationship Id="decoration" Type="${R}/${kind}" Target="${kind}1.xml"/><Relationship Id="styles" Type="${R}/styles" Target="styles.xml"/>`}${options.relationships||''}</Relationships>`,
  ...(content===null?{}:{[part]:options.raw?content:wrap(content,kind),'word/styles.xml':standardStyles}),
  ...options.files,
 };
 if(content===null&&!options.relationships)delete files['word/_rels/document.xml.rels'];
 return zipSync(Object.fromEntries(Object.entries(files).map(([name,value])=>[name,strToU8(value)])));
}
let cases=0;
function accepts(label,content,options={}){const result=exports.parseArticle(doc(content,options),'test.docx');assert.equal(JSON.stringify(result),JSON.stringify(expected),label);cases++;}
function rejects(label,content,options={}){for(const allowImages of [false,true])assert.throws(()=>exports.parseArticle(doc(content,options),'test.docx',allowImages),undefined,label);cases++;}

accepts('ordinary body remains unchanged',null);
accepts('empty footer','');
accepts('empty paragraph footer','<w:p/>');
accepts('empty styled header','<w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr><w:r><w:t>  </w:t></w:r></w:p>',{kind:'header'});
accepts('actual source footer shape','<w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="888888"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/><w:instrText xml:space="preserve">PAGE</w:instrText><w:fldChar w:fldCharType="end"/></w:r></w:p>');
accepts('complex PAGE cached result',`<w:p>${complex(' PAGE ','12')}</w:p>`);
accepts('header PAGE cached result',`<w:p>${complex('PAGE','2')}</w:p>`,{kind:'header'});
accepts('simple PAGE cached result','<w:p><w:fldSimple w:instr="PAGE"><w:r><w:t>12</w:t></w:r></w:fldSimple></w:p>');
accepts('PAGE code split across runs','<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText>PA</w:instrText></w:r><w:r><w:instrText>GE</w:instrText><w:fldChar w:fldCharType="end"/></w:r></w:p>');
accepts('valid namespace alias',`<a:ftr xmlns:a="${W}"><a:p><a:r><a:fldChar a:fldCharType="begin"/><a:instrText>PAGE</a:instrText><a:fldChar a:fldCharType="end"/></a:r></a:p></a:ftr>`,{raw:true});
accepts('valid package element namespace aliases',null,{files:{
 '[Content_Types].xml':`<c:Types xmlns:c="http://schemas.openxmlformats.org/package/2006/content-types"><c:Override PartName="/word/document.xml" ContentType="${CT}document.main+xml"/></c:Types>`,
 '_rels/.rels':`<p:Relationships xmlns:p="http://schemas.openxmlformats.org/package/2006/relationships"><p:Relationship Id="main" Type="${R}/officeDocument" Target="word/document.xml"/></p:Relationships>`,
}});
accepts('empty decoration relationship list','<w:p/>',{files:{'word/_rels/footer1.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'}});
accepts('unrelated body numbering styles do not block decoration',styledEmpty,{files:{'word/styles.xml':styleDoc(normal+style('Footer','<w:basedOn w:val="Normal"/>')+style('BodyList',numbered))}});
accepts('stylesWithEffects can omit new Footer style',styledEmpty,{files:{'word/stylesWithEffects.xml':styleDoc(normal)}});

rejects('real footer words','<w:p><w:r><w:t>原作者署名不得丢失</w:t></w:r></w:p>');
rejects('real header words','<w:p><w:r><w:t>真实页眉</w:t></w:r></w:p>',{kind:'header'});
rejects('numeric text outside field is not proven page numbering','<w:p><w:r><w:t>2026</w:t></w:r></w:p>');
rejects('real text beside PAGE',`<w:p>${complex()}<w:r><w:t>真实署名</w:t></w:r></w:p>`);
rejects('non-numeric PAGE cache',`<w:p>${complex('PAGE','真实文字')}</w:p>`);
rejects('cached text before separator',`<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText>PAGE</w:instrText><w:t>3</w:t><w:fldChar w:fldCharType="end"/></w:r></w:p>`);
for(const code of ['NUMPAGES','PAGE \\* MERGEFORMAT','PAGEREF a','INCLUDETEXT &quot;https://example.com/x&quot;','DDEAUTO example','HYPERLINK &quot;https://example.com&quot;','PAGE INCLUDETEXT x','DATE'])rejects(`non-whitelisted field ${code}`,`<w:p>${complex(code)}</w:p>`);
rejects('simple non-PAGE field','<w:p><w:fldSimple w:instr="DATE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>');
rejects('simple field with actual text','<w:p><w:fldSimple w:instr="PAGE"><w:r><w:t>真实文字</w:t></w:r></w:fldSimple></w:p>');
rejects('unfinished field','<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText>PAGE</w:instrText></w:r></w:p>');
rejects('unopened field end','<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>');
rejects('nested fields',`<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText>PAGE</w:instrText></w:r>${complex()}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`);
rejects('instruction without field','<w:p><w:r><w:instrText>PAGE</w:instrText></w:r></w:p>');
rejects('field crosses paragraphs','<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText>PAGE</w:instrText></w:r></w:p><w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>');
rejects('embedded drawing with no text','<w:p><w:r><w:drawing/></w:r></w:p>');
rejects('legacy picture with no text','<w:p><w:r><w:pict/></w:r></w:p>');
rejects('embedded object with no text','<w:p><w:r><w:object/></w:r></w:p>');
rejects('hyperlink with no text','<w:p><w:hyperlink r:id="link"><w:r><w:t/></w:r></w:hyperlink></w:p>');
rejects('unused decoration hyperlink relationship','<w:p/>',{files:{'word/_rels/footer1.xml.rels':`<Relationships><Relationship Id="link" Type="${R}/hyperlink" Target="https://example.com" TargetMode="External"/></Relationships>`}});
rejects('decoration image relationship','<w:p/>',{files:{'word/_rels/footer1.xml.rels':`<Relationships><Relationship Id="pic" Type="${R}/image" Target="../docProps/thumbnail.jpeg"/></Relationships>`,'docProps/thumbnail.jpeg':'inert'}});
rejects('unknown visible symbol','<w:p><w:r><w:sym w:char="F041"/></w:r></w:p>');
rejects('text-box content','<w:p><w:r><w:txbxContent><w:p><w:r><w:t>不得丢失</w:t></w:r></w:p></w:txbxContent></w:r></w:p>');
rejects('table without visible text','<w:tbl/>');
rejects('tracked deletion is still content','<w:p><w:del><w:r><w:delText>不得丢失</w:delText></w:r></w:del></w:p>');
rejects('alternate content','<w:p><w:r><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"/></w:r></w:p>');
rejects('wrong header/footer root',wrap('<w:p/>','header'),{raw:true});
rejects('spoofed namespace','<w:ftr xmlns:w="urn:wrong"><w:p/></w:ftr>',{raw:true});
rejects('nested spoofed namespace',`<w:ftr xmlns:w="${W}"><w:p xmlns:w="urn:wrong"/></w:ftr>`,{raw:true});
rejects('unbound field attribute','<w:p><w:r><w:fldChar fldCharType="begin"/></w:r></w:p>');
rejects('duplicate expanded instruction cannot hide INCLUDETEXT',`<w:p><w:fldSimple xmlns:a="${W}" w:instr="INCLUDETEXT &quot;evil&quot;" a:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>`);
rejects('reversed duplicate expanded instruction',`<w:p><w:fldSimple xmlns:a="${W}" a:instr="PAGE" w:instr="INCLUDETEXT &quot;evil&quot;"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>`);
rejects('duplicate expanded field type',`<w:p><w:r><w:fldChar xmlns:a="${W}" w:fldCharType="separate" a:fldCharType="begin"/><w:instrText>PAGE</w:instrText><w:fldChar w:fldCharType="end"/></w:r></w:p>`);
rejects('external entity declaration',`<!DOCTYPE w:ftr [<!ENTITY x SYSTEM "https://example.com">]><w:ftr xmlns:w="${W}"><w:p/></w:ftr>`,{raw:true});
rejects('malformed XML','<w:p>');
rejects('oversized decoration',`<w:p><w:r><w:t>${' '.repeat(128001)}</w:t></w:r></w:p>`);
rejects('macro filename',null,{files:{'word/vbaProject.bin':'inert fixture, not executable'}});
rejects('renamed macro content type',null,{contentTypes:'<Override PartName="/word/data.bin" ContentType="application/vnd.ms-office.vbaProject"/>',files:{'word/data.bin':'inert'}});
rejects('renamed macro relationship',null,{relationships:'<Relationship Id="macro" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="data.bin"/>',files:{'word/data.bin':'inert'}});
const coveredMacroType='<Override xmlns:e="urn:ext" PartName="/word/data.bin" ContentType="application/vnd.ms-office.vbaProject" e:ContentType="application/octet-stream"/>';
const coveredMacroRel=`<Relationship xmlns:e="urn:ext" Id="macro" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" e:Type="${R}/customXml" Target="data.bin"/>`;
rejects('namespace ContentType cannot hide macro independently','<w:p/>',{contentTypes:coveredMacroType,files:{'word/data.bin':'inert'}});
rejects('namespace relationship Type cannot hide macro independently','<w:p/>',{relationships:coveredMacroRel,files:{'word/data.bin':'inert'}});
rejects('namespace metadata overlays cannot hide both macro signals','<w:p/>',{contentTypes:coveredMacroType,relationships:coveredMacroRel,files:{'word/data.bin':'inert'}});
rejects('namespace Target cannot hide external content','<w:p/>',{relationships:`<Relationship xmlns:e="urn:ext" Id="masked" Type="${R}/customXml" Target="https://example.com/evil" e:Target="data.bin"/>`,files:{'word/data.bin':'inert'}});
rejects('namespace TargetMode cannot hide external relationship','<w:p/>',{relationships:`<Relationship xmlns:e="urn:ext" Id="masked" Type="${R}/customXml" Target="data.bin" TargetMode="External" e:TargetMode="Internal"/>`,files:{'word/data.bin':'inert'}});
rejects('wrong content types element namespace',null,{files:{'[Content_Types].xml':`<c:Types xmlns:c="urn:wrong"><c:Override PartName="/word/document.xml" ContentType="${CT}document.main+xml"/></c:Types>`}});
rejects('unbound content types element prefix',null,{files:{'[Content_Types].xml':`<c:Types><c:Override PartName="/word/document.xml" ContentType="${CT}document.main+xml"/></c:Types>`}});
rejects('macro-enabled main type smuggled beside normal declaration',null,{contentTypes:'<Override PartName="/word/document.xml" ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/>'});
rejects('ActiveX remains rejected',null,{files:{'word/activeX/activeX1.xml':'<control/>'}});
rejects('embedded object remains rejected',null,{files:{'word/embeddings/object.bin':'inert'}});
rejects('actual footnote text',null,{files:{'word/footnotes.xml':`<w:footnotes xmlns:w="${W}"><w:footnote w:id="1"><w:p><w:r><w:t>真实脚注不得丢失</w:t></w:r></w:p></w:footnote></w:footnotes>`}});
rejects('empty footnotes still outside this compatibility change',null,{files:{'word/footnotes.xml':`<w:footnotes xmlns:w="${W}"/>`}});
rejects('separator-only footnotes still rejected',null,{files:{'word/footnotes.xml':`<w:footnotes xmlns:w="${W}"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote></w:footnotes>`}});
rejects('empty endnotes still rejected',null,{files:{'word/endnotes.xml':`<w:endnotes xmlns:w="${W}"/>`}});
rejects('renamed footnotes identified by content type',null,{contentTypes:`<Override PartName="/word/notes.xml" ContentType="${CT}footnotes+xml"/>`,files:{'word/notes.xml':'<footnotes/>'}});
rejects('renamed footer identified by relationship',null,{relationships:`<Relationship Id="hidden" Type="${R}/footer" Target="decoration.xml"/>`,files:{'word/decoration.xml':wrap('<w:p/>')}});
rejects('body PAGE field remains unsupported',null,{body:`<w:p>${complex()}</w:p>`});
rejects('body footnote reference remains unsupported',null,{body:'<w:p><w:r><w:footnoteReference w:id="1"/></w:r></w:p>'});
rejects('empty footer with numbered style emits real text',styledEmpty,{files:{'word/styles.xml':styleDoc(normal+style('Footer',numbered))}});
rejects('PAGE footer with numbered style emits real text',`<w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr>${complex()}</w:p>`,{files:{'word/styles.xml':styleDoc(normal+style('Footer',numbered))}});
rejects('numbering inherited through basedOn chain',styledEmpty,{files:{'word/styles.xml':styleDoc(normal+style('Footer','<w:basedOn w:val="Base"/>')+style('Base','<w:basedOn w:val="Normal"/>'+numbered))}});
rejects('default paragraph numbering affects unstyled footer','<w:p/>',{files:{'word/styles.xml':styleDoc(style('Normal',numbered,'w:default="1"'))}});
rejects('implicit Normal style cannot hide numbering','<w:p/>',{files:{'word/styles.xml':styleDoc(style('Normal',numbered))}});
rejects('docDefaults paragraph numbering affects unstyled footer','<w:p/>',{files:{'word/styles.xml':styleDoc(normal,`<w:docDefaults><w:pPrDefault>${numbered}</w:pPrDefault></w:docDefaults>`)}});
rejects('numbered header style still contains real text','<w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr></w:p>',{kind:'header',files:{'word/styles.xml':styleDoc(normal+style('Header',numbered))}});
rejects('missing referenced style fails closed',styledEmpty,{files:{'word/styles.xml':styleDoc(normal)}});
rejects('cyclic basedOn fails closed',styledEmpty,{files:{'word/styles.xml':styleDoc(normal+style('Footer','<w:basedOn w:val="Base"/>')+style('Base','<w:basedOn w:val="Footer"/>'))}});
rejects('missing basedOn fails closed',styledEmpty,{files:{'word/styles.xml':styleDoc(normal+style('Footer','<w:basedOn w:val="Missing"/>'))}});
rejects('duplicate expanded style attributes fail closed',styledEmpty,{files:{'word/styles.xml':styleDoc(normal+`<w:style xmlns:a="${W}" w:type="paragraph" w:styleId="Hidden" a:styleId="Footer">${numbered}</w:style>`)}});
rejects('stylesWithEffects cannot add hidden numbering',styledEmpty,{files:{'word/stylesWithEffects.xml':styleDoc(normal+style('Footer',numbered))}});
rejects('noncanonical styles part declared by content type',styledEmpty,{contentTypes:`<Override PartName="/word/customstyles.xml" ContentType="${CT}styles+xml"/>`,files:{'word/customstyles.xml':styleDoc(normal+style('Footer',numbered))}});
rejects('noncanonical styles part declared by relationship',styledEmpty,{relationships:`<Relationship Id="customStyles" Type="${R}/styles" Target="customstyles.xml"/>`,files:{'word/customstyles.xml':styleDoc(normal+style('Footer',numbered))}});
rejects('alternate style content is not proven inert','<w:p/>',{files:{'word/styles.xml':styleDoc(`<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice>${style('Normal',numbered,'w:default="1"')}</mc:Choice></mc:AlternateContent>`)}});
rejects('alternate numbered Footer style content fails closed',styledEmpty,{files:{'word/styles.xml':styleDoc(normal+style('Footer',`<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><mc:Choice Requires="w14">${numbered}</mc:Choice><mc:Fallback>${numbered}</mc:Fallback></mc:AlternateContent>`))}});
rejects('ProcessContent cannot hide inherited numbered Footer',styledEmpty,{files:{'word/styles.xml':styleDoc(normal+`<w:style w:type="paragraph" w:styleId="Footer" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:e="urn:ext" mc:Ignorable="e" mc:ProcessContent="e:wrapper"><e:wrapper>${numbered}</e:wrapper></w:style>`)}});
console.log(`${cases} decoration acceptance/rejection cases passed; title, body, empty paragraphs, spacing and tabs preserved exactly`);
