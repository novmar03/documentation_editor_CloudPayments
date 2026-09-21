import assert from 'node:assert/strict';
import {Publisher} from '../lib/publish.ts';
import {renderDocument} from '../lib/document.ts';
import {preparePublishedDocument,normalizePublishedImages} from '../lib/image-assets.ts';
const content={type:'doc',content:[{type:'image',attrs:{src:'data:image/png;base64,'+'A'.repeat(2*1024*1024),alt:'test'}}]};
const publisher=new Publisher({provider:'github',project:'test/docs',branch:'main',host:'',token:'test'});
const data={pages:{test:{html:'old'}},groups:[]};
const files={'index.html':`<script id="document-data" type="application/json">${JSON.stringify(data)}</script>`,'scripts/export-html.py':'EDITOR_PAGES_FILE','sidebars.js':'editorPagesPath'};
publisher.file=async p=>files[p]?{content:files[p],sha:'old'}:null;
const requests=[];
publisher.api=async (path,init={})=>{
 const body=init.body?JSON.parse(init.body):null;requests.push({path,body});
 if(path.startsWith('/git/ref/heads/'))return {object:{sha:'parent'}};
 if(path==='/git/commits/parent')return {tree:{sha:'base'}};
 if(path==='/git/blobs')return {sha:'blob-'+requests.length};
 if(path==='/git/trees'){assert.ok(JSON.stringify(body).length<4096);assert.ok(body.tree.every(e=>e.sha&&!('content'in e)));return {sha:'tree'};}
 if(path==='/git/commits')return {sha:'commit'};
 return {};
};
const before=structuredClone(content);
const result=await publisher.publish({id:'test',title:'Test',baseHtml:'old'},content);
assert.equal(requests.filter(r=>r.path==='/git/blobs').length,9);
const binary=requests.filter(r=>r.path==='/git/blobs'&&r.body.encoding==='base64');
assert.equal(binary.length,1);
assert.equal(binary[0].body.content,'A'.repeat(2*1024*1024));
const tree=requests.find(r=>r.path==='/git/trees').body.tree;
assert.ok(tree.some(e=>/^static\/img\/editor\/[a-f0-9]{64}\.png$/.test(e.path)));
assert.ok(!result.html.includes('data:image/'));
assert.ok(result.html.includes('static/img/editor/'));
assert.deepEqual(content,before);
for(const r of requests.filter(r=>r.path==='/git/blobs'&&r.body.encoding==='utf-8'))assert.ok(!r.body.content.includes('data:image/'));
const prepared=await preparePublishedDocument({type:'doc',content:[content.content[0],content.content[0]]});
assert.equal(prepared.assets.size,1);
assert.equal(await normalizePublishedImages(renderDocument(content)),result.html);
assert.equal(prepared.doc.content[0].attrs.alt,'test');
await assert.rejects(()=>preparePublishedDocument({type:'doc',content:[{type:'image',attrs:{src:'',assetPath:'editor-assets/test.png'}}]}),/Изображение не загружено/);
assert.equal(requests.at(-1).body.force,false);
// Existing drafts remain publishable after the one-time URL migration.
data.pages.test.html=result.html;
files['index.html']=`<script id="document-data" type="application/json">${JSON.stringify(data)}</script>`;
await publisher.publish({id:'test',title:'Test',baseHtml:renderDocument(content)},content);
await assert.rejects(()=>publisher.publish({id:'test',title:'Test',baseHtml:'different text'},content),/На сайте есть изменения/);
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify({message:'Validation failed',errors:[{message:'Invalid tree'}]}),{status:422});
try{const p=new Publisher(publisher.config);await assert.rejects(()=>p.api('/git/trees'),/Validation failed; Invalid tree/);}finally{globalThis.fetch=originalFetch;}
console.log('PASS: binary image blobs, file URLs, deduplication, unchanged drafts, migration-compatible conflict checks and GitHub errors');
