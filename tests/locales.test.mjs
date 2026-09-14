import assert from 'node:assert/strict';
import {draftKey,editorRoute,pageUrl} from '../lib/locales.ts';
import {Repository,encodeText} from '../lib/repository.ts';
import {Publisher} from '../lib/publish.ts';
assert.equal(draftKey('tech/api'),'tech/api');
assert.equal(draftKey('tech/api','en'),'en/tech/api');
assert.deepEqual(editorRoute('#en/tech/api'),{id:'tech/api',locale:'en'});
assert.equal(pageUrl('/docs/','tech/api','en'),'/docs/#/en/tech/api');
const repo=new Repository({project:'test/editor',defaultBranch:'main',token:'test'});
assert.equal(repo.draftPath('tech/api'),'editor-data/pages/tech/api.json');
assert.equal(repo.draftPath('tech/api','en'),'editor-data/en/pages/tech/api.json');
const requests=[];repo.ready=true;
repo.request=async(path,options={})=>{requests.push({path,options});return options.method==='PUT'?{content:{sha:'saved'}}:{content:encodeText(JSON.stringify({id:'tech/api',title:'English',content:{type:'doc'},updated:'now',baseHtml:''})),sha:'english'};};
assert.equal((await repo.load('tech/api','en')).locale,'en');
await repo.save({id:'tech/api',locale:'en',title:'English',content:{type:'doc'},updated:'now',baseHtml:''});
await repo.history('tech/api','en');await repo.revision('tech/api','revision','en');
assert.ok(requests.every(r=>decodeURIComponent(r.path).includes('editor-data/en/pages/tech/api.json')));
const original={groups:[{id:'tech',items:[{id:'tech/api',title:'Русское название'}]}],pages:{'tech/api':{id:'tech/api',title:'Русское название',html:'<p>Русский текст</p>',toc:[],group:'tech'}}};
const files={
 'index.html':'<script id="document-data" type="application/json">'+JSON.stringify(original)+'</script>',
 'src/components/navigation.json':JSON.stringify(original.groups),
 'src/content/editor-pages.json':'{"untouched":"Russian source"}',
 'src/content/editor-pages.en.json':'{}',
 'scripts/export-html.py':'EDITOR_PAGES_FILE',
 'sidebars.js':'editorPagesPath'
};
let writes={};const pub=new Publisher({provider:'github',project:'test/docs',branch:'main',host:'',token:'test'});
pub.file=async p=>files[p]?{content:files[p],sha:'old'}:null;
const blobs=new Map();
pub.api=async(path,init={})=>{
 const body=init.body?JSON.parse(init.body):null;
 if(path.startsWith('/git/ref/heads/'))return {object:{sha:'parent'}};
 if(path==='/git/commits/parent')return {tree:{sha:'base'}};
 if(path==='/git/blobs'){const sha='blob'+blobs.size;blobs.set(sha,body.content);return {sha};}
 if(path==='/git/trees'){writes=Object.fromEntries(body.tree.map(e=>[e.path,blobs.get(e.sha)]));return {sha:'tree'};}
 if(path==='/git/commits')return {sha:'commit'};
 return {};
};
const content={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Manual English translation'}]}]};
const result=await pub.publish({id:'tech/api',locale:'en',title:'English API',baseHtml:''},content);
const data=JSON.parse(writes['index.html'].match(/<script id="document-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
assert.deepEqual(data.pages,original.pages);
assert.deepEqual(data.groups,original.groups);
assert.equal(data.translations.en.pages['tech/api'].title,'English API');
assert.ok(writes['src/content/editor-pages.en.json'].includes('Manual English translation'));
assert.ok(writes['i18n/en/docusaurus-plugin-content-docs/current/tech/api.md']);
assert.ok(!('src/content/editor-pages.json' in writes));
assert.ok(!('src/components/navigation.json' in writes));
assert.ok(!('docs/tech/api.md' in writes));
files['index.html']=writes['index.html'];
await assert.rejects(()=>pub.publish({id:'tech/api',locale:'en',title:'English API',baseHtml:''},content),/На сайте есть изменения/);
await pub.publish({id:'tech/api',locale:'en',title:'English API',baseHtml:'',publishedHtml:result.html},content);
console.log('Verified independent draft paths, history, publication and English conflict detection.');
