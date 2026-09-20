import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import {structureNodes,navigationGroups,moveNode,updateNode,validateNavigation,visibleTree} from '../lib/structure.ts';
import {structureWrites,readerNavigation,installStructureReader,installStructureSidebar} from '../lib/structure-publication.ts';
import {Publisher} from '../lib/publish.ts';
const initial=JSON.parse(readFileSync(new URL('../lib/navigation.json',import.meta.url)));
const fixture=JSON.parse(readFileSync(new URL('./fixtures/structure-site.json',import.meta.url)));
function files(){
 const pages=Object.fromEntries(initial.flatMap(g=>g.items.map(p=>[p.id,{...p,group:g.id,html:'<h2 id="stable-anchor">Content</h2>',toc:[{id:'stable-anchor',title:'Content',level:2}]}])));
 const data={groups:initial,pages,translations:{en:{pages:{'tech/api':{...pages['tech/api'],title:'English API',html:'English content',toc:[]}}}}};
 return {...fixture,'src/components/navigation.json':JSON.stringify(initial),'index.html':fixture['src/offline-template.html'].replace('/* DOCUMENT_DATA */',JSON.stringify(data))};
}
const pageIds=groups=>structureNodes(groups).filter(n=>n.type!=='category').map(n=>n.id).sort();
test('moves preserve page identities and subtrees, including promotion to top level',()=>{
 let groups=moveNode(initial,'tech/methods','section:start','start/connect');
 assert.deepEqual(pageIds(groups),pageIds(initial));
 assert.equal(structureNodes(groups).find(n=>n.id==='tech/methods/tpay').parent,'tech/methods');
 groups=moveNode(groups,'tech/methods');
 assert.equal(structureNodes(groups).find(n=>n.id==='tech/methods').parent,undefined);
 assert.deepEqual(pageIds(groups),pageIds(initial));
 assert.throws(()=>moveNode(groups,'tech/methods','tech/methods/tpay'));
 groups=moveNode(groups,'section:start','tech/methods');
 validateNavigation(groups);assert.deepEqual(pageIds(groups),pageIds(initial));
 assert(structureNodes(groups).some(n=>n.type==='category'&&n.parent==='tech/methods'));
});
test('reorder, audience overrides, shared nodes, and recoverable hiding',()=>{
 const reordered=moveNode(initial,'tech/api','section:tech','tech/widget');
 assert.equal(reordered.find(g=>g.id==='tech').items[0].id,'tech/api');
 const both=updateNode(initial,'tech/api',{audience:'both'});
 for(const audience of ['business','developer'])assert(visibleTree(both,audience).some(n=>n.id==='tech/api'));
 assert.equal(visibleTree(both,'business').find(n=>n.id==='tech/api').parent,undefined);
 const hidden=updateNode(both,'tech/methods',{hidden:true});
 assert(!visibleTree(hidden,'developer').some(n=>n.id==='tech/methods/tpay'));
 assert.deepEqual(pageIds(hidden),pageIds(initial));
 assert(visibleTree(updateNode(hidden,'tech/methods',{hidden:false}),'developer').some(n=>n.id==='tech/methods/tpay'));
});
test('publishing creates pages, preserves hidden content and English, and rejects stale structure',()=>{
 let groups=updateNode(initial,'tech/api',{hidden:true,title:'Новое название'});
 groups=navigationGroups([...structureNodes(groups),{id:'new/page',key:'new/page',title:'Новая страница',type:'page',audience:'both'},{id:'new-category',key:'new-category',title:'Раздел',type:'category',audience:'both',parent:'section:tech'}]);
 const source=files(),writes=structureWrites(source,groups,initial);
 const data=JSON.parse(writes['index.html'].match(/<script id="document-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
 assert.equal(data.pages['tech/api'].html,'<h2 id="stable-anchor">Content</h2>');
 assert.equal(data.translations.en.pages['tech/api'].title,'English API');
 assert.equal(data.translations.en.pages['tech/api'].html,'English content');
 assert(writes['docs/new/page.md']);assert(writes['i18n/en/docusaurus-plugin-content-docs/current/new/page.md'].includes('page="new/page"'));
 assert(!writes['docs/new-category.md']);
 assert.throws(()=>structureWrites(source,groups,groups),/уже изменилась/);
 const repeat=structureWrites({...source,...writes},groups,groups);
 assert.equal(repeat['sidebars.js'],writes['sidebars.js']);assert.equal(repeat['index.html'],writes['index.html']);
 assert.equal(installStructureReader(writes['src/offline-template.html']),writes['src/offline-template.html']);
});
test('Docusaurus sidebar distinguishes categories, hidden docs, and root pages',()=>{
 let groups=moveNode(initial,'tech/api');groups=updateNode(groups,'tech/methods',{hidden:true});
 groups=navigationGroups([...structureNodes(groups),{id:'empty',key:'empty',title:'Пустой раздел',type:'category',audience:'both',parent:'section:tech'}]);
 const context={module:{exports:{}},process:{env:{}},__dirname:'/docs',require:p=>p==='./src/components/navigation.json'?groups:p==='node:path'?{join:(...parts)=>parts.join('/')}:p==='node:fs'?{existsSync:()=>false}:null};
 vm.runInNewContext(installStructureSidebar(fixture['sidebars.js']),context);
 const flattened=[];function visit(items){for(const n of items){flattened.push(n);if(n.items)visit(n.items);}}visit(context.module.exports.docs);
 assert(context.module.exports.docs.some(n=>n.link?.id==='tech/api'));
 assert(!flattened.some(n=>n.id==='tech/methods/tpay'||n.link?.id==='tech/methods'));
 assert(!flattened.some(n=>n.label==='Пустой раздел'));
});
test('reader filters per-page audiences, promotes children, and skips hidden descendants',()=>{
 const groups=updateNode(updateNode(initial,'tech/api',{audience:'both'}),'tech/methods',{hidden:true});
 const result=vm.runInNewContext(readerNavigation+';visibleNavigation(groups,"business")',{groups});
 const items=result.flatMap(g=>g.items);assert(items.some(p=>p.id==='tech/api'));assert(!items.some(p=>p.id==='tech/methods/tpay'));
});
test('structure publish uses one non-forced commit and refuses occupied routes',async()=>{
 const source=files(),pub=new Publisher({provider:'github',project:'test/docs',branch:'main',host:'',token:'test'});
 const calls=[];pub.file=async p=>source[p]?{content:source[p],sha:'old'}:null;
 pub.api=async(path,init={})=>{const body=init.body?JSON.parse(init.body):undefined;calls.push({path,body});if(path.startsWith('/git/ref/heads/'))return {object:{sha:'base'}};if(path==='/git/commits/base')return {tree:{sha:'tree'}};return {sha:'created'};};
 await pub.publishStructure(updateNode(initial,'tech/api',{hidden:true}),initial);
 assert.equal(calls.filter(c=>c.path==='/git/commits').length,1);
 assert.equal(calls.at(-1).body.force,false);
 const next=navigationGroups([...structureNodes(initial),{id:'occupied',key:'occupied',title:'Занято',type:'page',audience:'both'}]);source['docs/occupied.md']='Existing';
 await assert.rejects(()=>pub.publishStructure(next,initial),/Адрес уже занят/);
});
