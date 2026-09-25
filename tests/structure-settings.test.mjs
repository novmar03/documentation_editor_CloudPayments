import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStructureDraft,recoverStructureDraft,structureDirty,documentationSettingsPath} from '../lib/structure.ts';
import {structureWrites} from '../lib/structure-publication.ts';
import {Publisher} from '../lib/publish.ts';

const groups=JSON.parse(readFileSync(new URL('../lib/navigation.json',import.meta.url)));
const fixture=JSON.parse(readFileSync(new URL('./fixtures/structure-site.json',import.meta.url)));
function files(showOverviewPage=true){
 const pages=Object.fromEntries(groups.flatMap(g=>g.items.map(p=>[p.id,{...p,html:'content',toc:[],group:g.id}])));
 return {...fixture,[documentationSettingsPath]:JSON.stringify({showOverviewPage,otherSetting:'preserved'}),'src/components/navigation.json':JSON.stringify(groups),'index.html':fixture['src/offline-template.html'].replace('/* DOCUMENT_DATA */',JSON.stringify({groups,pages,translations:{en:{pages:{}}}}))};
}
test('toggle-only changes are dirty, survive a local draft reload, and loading published settings resets them',()=>{
 const published=createStructureDraft(groups,{showOverviewPage:true});
 assert.equal(structureDirty(published),false);
 const changed={...published,settings:{showOverviewPage:false}};
 assert.equal(structureDirty(changed),true);
 const recovered=recoverStructureDraft(JSON.parse(JSON.stringify(changed)),published);
 assert.equal(recovered.settings.showOverviewPage,false);
 assert.equal(structureDirty(recovered),true);
 const loaded=recoverStructureDraft(null,published);
 assert.equal(loaded.settings.showOverviewPage,true);
 assert.equal(structureDirty(loaded),false);
 const afterPublish=createStructureDraft(changed.groups,changed.settings);
 assert.equal(afterPublish.settings.showOverviewPage,false);
 assert.equal(structureDirty(afterPublish),false);
});
test('older local drafts load the published shared setting and missing configuration defaults to enabled',()=>{
 assert.equal(createStructureDraft(groups).settings.showOverviewPage,true);
 const recovered=recoverStructureDraft({groups,base:groups},createStructureDraft(groups,{showOverviewPage:false}));
 assert.equal(recovered.settings.showOverviewPage,false);
 assert.equal(recovered.baseSettings.showOverviewPage,false);
 assert.equal(structureDirty(recovered),false);
});
for(const enabled of [true,false])test('structure publication persists shared setting and standalone data: '+enabled,()=>{
 const source=files(!enabled),settings={showOverviewPage:enabled};
 const writes=structureWrites(source,groups,groups,settings,{showOverviewPage:!enabled});
 assert.deepEqual(JSON.parse(writes[documentationSettingsPath]),{...settings,otherSetting:'preserved'});
 const data=JSON.parse(writes['index.html'].match(/<script id="document-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
 assert.equal(data.settings.showOverviewPage,enabled);
 assert.deepEqual(data.groups,groups);
 assert.deepEqual(data.translations,{en:{pages:{}}});
 assert(!Object.keys(writes).some(path=>path.startsWith('i18n/')&&path.endsWith('documentation-settings.json')));
 assert.throws(()=>structureWrites(source,groups,groups,settings,settings),/уже изменились/);
});
test('settings and navigation use a single non-forced commit from the same site revision',async()=>{
 const source=files(),pub=new Publisher({provider:'github',project:'test/docs',branch:'main',host:'',token:'test'}),reads=[],calls=[];
 pub.file=async(path,ref)=>{reads.push({path,ref});return source[path]?{content:source[path],sha:'old'}:null;};
 pub.api=async(path,init={})=>{const body=init.body?JSON.parse(init.body):undefined;calls.push({path,body});if(path==='/git/ref/heads/main')return {object:{sha:'snapshot'}};if(path==='/git/commits/snapshot')return {tree:{sha:'base-tree'}};return {sha:'new-object'};};
 await pub.publishStructure(groups,groups,{showOverviewPage:false},{showOverviewPage:true});
 assert(reads.every(r=>r.ref==='snapshot'));
 assert(reads.some(r=>r.path===documentationSettingsPath));
 const entries=calls.find(c=>c.path==='/git/trees').body.tree;
 assert(entries.some(e=>e.path===documentationSettingsPath));
 assert(entries.some(e=>e.path==='src/components/navigation.json'));
 const stored=calls.filter(c=>c.path==='/git/blobs').map(c=>c.body.content);
 assert(stored.includes(JSON.stringify({showOverviewPage:false,otherSetting:'preserved'},null,2)+'\n'));
 assert.equal(calls.filter(c=>c.path==='/git/commits').length,1);
 assert.equal(calls.at(-1).body.force,false);
});
