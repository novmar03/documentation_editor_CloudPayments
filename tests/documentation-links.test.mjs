import assert from 'node:assert/strict';
import vm from 'node:vm';
import {documentationHref,parseDocumentationHref,publicHeadingUrl,pageSections,localePages,installOfflineLinks,installNativeLinks} from '../lib/documentation-links.ts';
import {normalizeHeadings,renderDocument} from '../lib/document.ts';
import {Publisher} from '../lib/publish.ts';
const ids=['tech/api','reference/testing'];
assert.equal(documentationHref('tech/api','ru','refund-stable'),'/tech/api/#refund-stable');
assert.equal(documentationHref('tech/api','en'),'/en/tech/api/');
const anchor='Возврат средств';
assert.deepEqual(parseDocumentationHref(documentationHref('tech/api','en',anchor),ids),{id:'tech/api',locale:'en',anchor});
assert.equal(parseDocumentationHref('https://example.com/tech/api/#refund',ids),null);
assert.equal(parseDocumentationHref('//example.com/tech/api/',ids),null);
assert.equal(parseDocumentationHref('/unknown/',ids),null);
assert.deepEqual(parseDocumentationHref('#/en/tech/api@refund-stable',ids),{id:'tech/api',locale:'en',anchor:'refund-stable'});
assert.equal(publicHeadingUrl('https://docs.example.com/base/','tech/api','en','refund-stable'),'https://docs.example.com/base/#/en/tech/api@refund-stable');
assert.equal(publicHeadingUrl('https://docs.example.com/','tech/api','ru','refund-stable','path'),'https://docs.example.com/tech/api/#refund-stable');
const document={type:'doc',content:[{type:'heading',attrs:{id:'refund-stable',level:6},content:[{type:'text',text:'Renamed heading'}]}]};
assert.equal(pageSections({content:normalizeHeadings(document)})[0].id,'refund-stable');
assert.equal(pageSections({toc:[{id:'h1',title:'Title',level:1},{id:'h2',title:'Section',level:2}]}).length,1);
assert.deepEqual(localePages({pages:{ru:{toc:[]}}},'en'),{});
const makeContent=locale=>({type:'doc',content:[{type:'paragraph',content:[
 {type:'text',text:'Section',marks:[{type:'link',attrs:{href:documentationHref('tech/api',locale,'refund-stable')}}]},
 {type:'text',text:'External',marks:[{type:'link',attrs:{href:'https://example.com/a?b=1'}}]}
]}]});
assert(renderDocument(makeContent('en')).includes('href="/en/tech/api/#refund-stable"'));
const native="export default function EditedSection(){\n const html='';\n return <div dangerouslySetInnerHTML={{__html:html}}/>;\n}";
const patched=installNativeLinks(native);
assert.equal(installNativeLinks(patched),patched);
const fragment=patched.slice(patched.indexOf(' const documentationRoutes='),patched.indexOf(' return <div'));
for(const base of ['/docs/','/docs/en/']){
 const result=vm.runInNewContext(fragment+'documentationLinkedHtml',{base,html:renderDocument(makeContent('en')),linkNavigation:[{items:ids.map(id=>({id}))}]});
 assert(result.includes('href="/docs/en/tech/api/#refund-stable"'));
 assert(result.includes('href="https://example.com/a?b=1" target="_blank"'));
}
const standalone=installOfflineLinks('<body></body>');
assert.equal(installOfflineLinks(standalone),standalone);
const links=['/tech/api/#refund-stable','/en/tech/api/','https://example.com/','/unrelated/'].map(href=>({href,getAttribute(){return this.href;},setAttribute(_,v){this.href=v;}}));
vm.runInNewContext(standalone.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1],{document:{body:{},getElementById:()=>({textContent:JSON.stringify({pages:Object.fromEntries(ids.map(id=>[id,{}]))})}),querySelectorAll:()=>links},MutationObserver:class{observe(){}}});
assert.deepEqual(links.map(l=>l.href),['#/tech/api@refund-stable','#/en/tech/api','https://example.com/','/unrelated/']);
for(const locale of ['ru','en']){
 const original={pages:{'tech/api':{id:'tech/api',title:'API',html:'',toc:[]}},groups:[{items:[{id:'tech/api',title:'API'}]}]};
 const files={'index.html':'<body><script id="document-data" type="application/json">'+JSON.stringify(original)+'</script></body>','src/offline-template.html':'<body></body>','scripts/export-html.py':'EDITOR_PAGES_FILE','sidebars.js':'editorPagesPath'};
 const pub=new Publisher({provider:'github',project:'test/docs',branch:'main',host:'',token:'test'});
 pub.file=async p=>files[p]?{content:files[p],sha:'old'}:null;
 const blobs=new Map();let writes;
 pub.api=async(path,init={})=>{const body=init.body?JSON.parse(init.body):null;
  if(path.startsWith('/git/ref/heads/'))return {object:{sha:'parent'}};
  if(path==='/git/commits/parent')return {tree:{sha:'base'}};
  if(path==='/git/blobs'){const sha='blob'+blobs.size;blobs.set(sha,body.content);return {sha};}
  if(path==='/git/trees'){writes=Object.fromEntries(body.tree.map(e=>[e.path,blobs.get(e.sha)]));return {sha:'tree'};}
  if(path==='/git/commits')return {sha:'commit'};return {};
 };
 const content=makeContent(locale),before=structuredClone(content);
 const result=await pub.publish({id:'tech/api',locale,title:'API',baseHtml:''},content);
 assert.deepEqual(content,before);
 assert(result.html.includes('href="'+documentationHref('tech/api',locale,'refund-stable')+'"'));
 assert(writes['index.html'].includes('editor-documentation-links'));
 assert(writes['src/offline-template.html'].includes('editor-documentation-links'));
 assert(writes['src/components/EditedSection.jsx'].includes('documentationLinkedHtml'));
 const published=JSON.parse(writes['index.html'].match(/<script id="document-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
 if(locale==='en')assert.deepEqual(published.pages,original.pages);
}
console.log('Verified locale links, stable IDs, external URLs, base paths, reader routing and publication without draft mutation.');
