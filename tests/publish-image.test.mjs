import assert from 'node:assert/strict';
import {Publisher} from '../lib/publish.ts';
import {storedDocument} from '../lib/repository.ts';
import {renderDocument} from '../lib/document.ts';
const note='@startuml\nAlice -> Bob: Проверка\n@enduml';
const content={type:'doc',content:[{type:'image',attrs:{src:'data:image/png;base64,'+'A'.repeat(2*1024*1024),alt:'test',scriptNote:note}}]};
assert.equal(storedDocument(content).content[0].attrs.scriptNote,note);
assert.ok(!renderDocument(content).includes('@startuml'));
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
await publisher.publish({id:'test',title:'Test',baseHtml:'old'},content);
assert.equal(requests.filter(r=>r.path==='/git/blobs').length,7);
assert.ok(requests.find(r=>r.path==='/git/blobs').body.content.length>2*1024*1024);
assert.equal(requests.at(-1).body.force,false);
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify({message:'Validation failed',errors:[{message:'Invalid tree'}]}),{status:422});
try{const p=new Publisher(publisher.config);await assert.rejects(()=>p.api('/git/trees'),/Validation failed; Invalid tree/);}finally{globalThis.fetch=originalFetch;}
console.log('PASS: large-image publication uses small SHA-only tree, script retained in drafts and omitted from HTML, GitHub error details');
