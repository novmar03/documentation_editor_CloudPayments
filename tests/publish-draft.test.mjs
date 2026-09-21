import test from 'node:test';
import assert from 'node:assert/strict';
import {Repository,storedDocument} from '../lib/repository.ts';
import {Publisher} from '../lib/publish.ts';
import {gitMemory} from './git-memory.mjs';

for(const locale of ['ru','en'])test('save, publish, reopen and save again preserve image and carousel content: '+locale,async()=>{
  const remote=gitMemory();
  const image=id=>({type:'image',attrs:{imageId:id,src:'data:image/png;base64,AQID',assetPath:'editor-assets/1234.png',alt:'Alt',width:70,align:'left',caption:'Caption'}});
  const device=()=>{
    const repo=new Repository({project:'test/editor',defaultBranch:'main',token:'test'});
    repo.ready=true;repo.request=remote.request;repo.image=async()=>image('one').attrs.src;return repo;
  };
  const repo=device(),content={type:'doc',content:[image('one'),{type:'carousel',content:[image('two'),image('three')]}]};
  const saved=await repo.save({id:'page',locale,title:'Title',content:storedDocument(content),baseHtml:'',updated:'now'});
  const data={pages:{page:{html:''}},groups:[]};
  const files={'index.html':'<script id="document-data" type="application/json">'+JSON.stringify(data)+'</script>','scripts/export-html.py':'EDITOR_PAGES_FILE','sidebars.js':'editorPagesPath'};
  const pub=new Publisher({provider:'github',project:'test/docs',branch:'main',host:'',token:'test'}),writes=[];
  pub.file=async path=>files[path]?{content:files[path],sha:'old'}:null;
  pub.api=async(path,options={})=>{
    if(path.startsWith('/git/ref/heads/'))return {object:{sha:'parent'}};
    if(path==='/git/commits/parent')return {tree:{sha:'base'}};
    if(path==='/git/blobs'){writes.push(JSON.parse(options.body));return {sha:'blob-'+writes.length};}
    return {sha:'commit'};
  };
  const result=await pub.publish(saved,await repo.hydrate(saved.content));
  const published=await repo.save({...saved,publishedHtml:result.html});
  const second=device(),loaded=await second.load('page',locale);
  assert.deepEqual(await second.hydrate(loaded.content),content);
  const edited=await second.save({...loaded,title:'Edited after publishing'});
  assert.equal((await device().load('page',locale)).title,'Edited after publishing');
  await assert.rejects(()=>repo.save({...published,title:'Stale tab'}),/изменился/);
  assert.equal(edited.publishedHtml,result.html);
  assert(!remote.requests.some(r=>r.path.includes('image-notes')));
  assert(writes.filter(w=>w.encoding==='utf-8').every(w=>!w.content.includes('assetPath')));
});
