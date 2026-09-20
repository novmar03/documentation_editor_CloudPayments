import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {renderDocument,validateDocument} from '../lib/document.ts';
import {preparePublishedDocument} from '../lib/image-assets.ts';
import {Repository,storedDocument} from '../lib/repository.ts';
import {uploadEditorImage} from '../lib/image-upload.ts';
import {Publisher} from '../lib/publish.ts';
import {installCarouselHtml,installCarouselComponent} from '../lib/carousel-publication.ts';
import {installCarouselRuntime} from '../lib/carousel-runtime.js';

const src='data:image/png;base64,AQID';
const slide=(caption='Подпись')=>({type:'image',attrs:{src,alt:'Описание <изображения>',caption,assetPath:'editor-assets/1234.png'}});
const content={type:'doc',content:[{type:'carousel',attrs:{id:'stable-carousel'},content:[slide(),slide('<script>alert(1)</script>')]}]};
test('carousel images use the existing recursive storage, hydration and deduplication',async()=>{
 validateDocument(content);const original=structuredClone(content);
 const stored=storedDocument(content);assert.equal(stored.content[0].content[0].attrs.src,'');assert.equal(stored.content[0].content[0].attrs.caption,'Подпись');
 const repo=new Repository({project:'test/editor',defaultBranch:'main',token:'test'});repo.image=async()=>src;
 assert.deepEqual(await repo.hydrate(stored),content);
 const prepared=await preparePublishedDocument(content);assert.equal(prepared.assets.size,1);assert(prepared.doc.content[0].content.every(n=>n.attrs.src.startsWith('static/img/editor/')));
 assert.deepEqual(content,original);
 await assert.rejects(()=>preparePublishedDocument(stored),/Изображение не загружено/);
});
test('rendering safely preserves captions, alt text, slide order and count',()=>{
 const html=renderDocument(content);assert(html.includes('data-editor-carousel'));assert(html.includes('data-carousel-counter'));assert(html.includes('1 / 2'));assert(html.includes('data-carousel-slide hidden'));
 assert(html.includes('Описание &lt;изображения&gt;'));assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert(!html.includes('<script>'));
 assert.equal(renderDocument({type:'doc',content:[{type:'carousel',content:[]}]}),'<div class="imported-api"></div>');
 assert.throws(()=>validateDocument({type:'doc',content:[{type:'carousel',content:[{type:'paragraph'}]}]}),/только изображения/);
});
test('single and multiple image upload share validation and repository upload',async()=>{
 const file=new File([new Uint8Array([1,2,3])],'image.png',{type:'image/png'}),calls=[];
 const repo={upload:async input=>{calls.push(input);return {src,assetPath:'editor-assets/1234.png',alt:input.name};}};
 assert.equal((await uploadEditorImage(file,repo)).assetPath,'editor-assets/1234.png');assert.equal(calls[0],file);
 assert.equal((await uploadEditorImage(file,null)).src,src);
 await assert.rejects(()=>uploadEditorImage(new File(['text'],'file.txt',{type:'text/plain'}),repo),/Выберите PNG/);
 await assert.rejects(()=>uploadEditorImage(new File([new Uint8Array(5*1024*1024+1)],'big.png',{type:'image/png'}),repo),/5 МБ/);
 assert.equal(calls.length,1);
});
test('carousel runtime switches independently, wraps, swipes horizontally and cleans up',()=>{
 const oldObserver=globalThis.MutationObserver;let disconnected=false;
 globalThis.MutationObserver=class{observe(){}disconnect(){disconnected=true;}};
 function carousel(size){const handlers={},slides=Array.from({length:size},()=>({hidden:false})),counter={textContent:''};
  const element={querySelectorAll:()=>slides,querySelector:()=>counter,addEventListener:(key,fn)=>{handlers[key]=fn;},removeEventListener:key=>{delete handlers[key];}};
  return {element,slides,counter,handlers,click:step=>handlers.click({target:{closest:()=>({closest:()=>element,disabled:false,getAttribute:()=>String(step)})}})};
 }
 const a=carousel(3),b=carousel(1),style={remove(){this.removed=true;}},doc={createElement:()=>style,head:{append(){}}};
 const root={ownerDocument:doc,contains:()=>true,querySelectorAll:()=>[a.element,b.element]};
 try{const stop=installCarouselRuntime(root);assert.equal(a.counter.textContent,'1 / 3');a.click(1);assert.equal(a.counter.textContent,'2 / 3');assert.equal(b.counter.textContent,'1 / 1');a.click(-1);a.click(-1);assert.equal(a.counter.textContent,'3 / 3');
  a.handlers.touchstart({touches:[{clientX:200,clientY:100}]});a.handlers.touchend({changedTouches:[{clientX:60,clientY:105}]});assert.equal(a.counter.textContent,'1 / 3');
  a.handlers.touchstart({touches:[{clientX:200,clientY:100}]});a.handlers.touchend({changedTouches:[{clientX:190,clientY:300}]});assert.equal(a.counter.textContent,'1 / 3');
  a.handlers.keydown({target:{closest:()=>null},key:'ArrowRight',preventDefault(){}});assert.equal(a.counter.textContent,'2 / 3');assert.deepEqual(a.slides.map(s=>s.hidden),[true,false,true]);
  stop();assert(disconnected);assert(style.removed);assert.deepEqual(a.handlers,{});
 }finally{globalThis.MutationObserver=oldObserver;}
});
test('publication installs the same carousel renderer for RU, EN and subsequent HTML builds',async()=>{
 for(const locale of ['ru','en']){
  const data={pages:{test:{id:'test',title:'Страница',html:'',toc:[]}},groups:[{id:'group',items:[{id:'test',title:'Страница'}]}]};
  const files={'index.html':'<body><script id="document-data" type="application/json">'+JSON.stringify(data)+'</script></body>','src/offline-template.html':'<body></body>','scripts/export-html.py':'EDITOR_PAGES_FILE','sidebars.js':'editorPagesPath'};
  const pub=new Publisher({provider:'github',project:'test/docs',branch:'main',host:'',token:'test'}),blobs=new Map();let writes;
  pub.file=async path=>files[path]?{content:files[path],sha:'old'}:null;
  pub.api=async(path,init={})=>{const body=init.body?JSON.parse(init.body):null;if(path.startsWith('/git/ref/heads/'))return {object:{sha:'parent'}};if(path==='/git/commits/parent')return {tree:{sha:'base'}};if(path==='/git/blobs'){const sha='blob'+blobs.size;blobs.set(sha,body);return {sha};}if(path==='/git/trees'){writes=Object.fromEntries(body.tree.map(e=>[e.path,blobs.get(e.sha).content]));return {sha:'tree'};}return {sha:'commit'};};
  await pub.publish({id:'test',locale,title:'Страница',baseHtml:''},content);
  assert.equal([...blobs.values()].filter(b=>b.encoding==='base64').length,1);
  assert(writes['index.html'].includes('id="editor-carousel-runtime"'));assert(writes['src/offline-template.html'].includes('id="editor-carousel-runtime"'));
  assert(writes['src/components/carousel-runtime.js'].includes("'touchend'"));assert(writes['src/components/EditedSection.jsx'].includes('useCarouselEffect'));
  const overlay=JSON.parse(writes['src/content/editor-pages'+(locale==='en'?'.en':'')+'.json']);assert.equal(overlay.test.content.content[0].content[1].attrs.caption,'<script>alert(1)</script>');assert(!overlay.test.html.includes('data:image'));
  assert.equal(installCarouselHtml(writes['index.html']),writes['index.html']);assert.equal(installCarouselComponent(writes['src/components/EditedSection.jsx']),writes['src/components/EditedSection.jsx']);
 }
});
