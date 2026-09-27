import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Repository} from '../lib/repository.ts';
import {selectRecovery} from '../lib/draft-recovery.ts';
import {gitMemory} from './git-memory.mjs';

const make=()=>new Repository({project:'test/editor',defaultBranch:'main',token:'test'});
const draft=locale=>({id:'page',locale,title:'Page',content:{type:'doc',content:[]},baseHtml:'',updated:'2026-09-27'});
const headPath='/git/ref/heads/documentation-drafts',refPath='/git/refs/heads/documentation-drafts';

test('cached HEAD cannot poison initial save or retries through actual fetch wrapper',async()=>{
  const memory=gitMemory(),repo=make();repo.ready=true;
  const stale=await memory.request(headPath);memory.seed('editor-assets/one.png','first upload');
  let updates=0,reads=0;const previous=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    const path=String(url).split('/repos/test/editor')[1];
    if(path===headPath){reads++;return Response.json(options.cache==='no-store'?await memory.request(path):stale);}
    if(path===refPath&&++updates===1){memory.seed('editor-assets/two.png','second upload');return Response.json({message:'Update is not a fast forward'},{status:422});}
    try{return Response.json(await memory.request(path,options));}
    catch(e){return Response.json({message:e.githubMessage||'Not Found'},{status:e.status||500});}
  };
  try{
    const saved=await repo.save(draft('ru'));
    assert.equal(reads,2);assert.equal(updates,2);
    assert.equal(saved.commit,memory.read(repo.draftPath('page')).sha);
    assert.equal(memory.json('editor-assets/one.png'),'first upload');
    assert.equal(memory.json('editor-assets/two.png'),'second upload');
  }finally{globalThis.fetch=previous;}
});

for(const locale of ['ru','en'])test('recovery and reconnect preserve conflicts and allow unchanged remote: '+locale,async()=>{
  const memory=gitMemory(),repo=make();repo.ready=true;repo.request=memory.request;
  const base=await repo.save(draft(locale));
  const local={...base,title:'Local edit',updated:'2026-09-28'};
  const recovered=selectRecovery(local,await repo.load('page',locale));
  assert.equal(recovered.commit,base.commit);
  const remote=await repo.save({...base,title:'Other device'});
  const reconnect=make();reconnect.ready=true;reconnect.request=memory.request;
  const recoveredConflict=selectRecovery(local,remote);
  await assert.rejects(()=>reconnect.save(recoveredConflict),/Черновик изменился/);
  assert.equal(memory.json(repo.draftPath('page',locale)).title,'Other device');
  assert.equal(selectRecovery(local,remote,true),null);
  const offline={...local,commit:undefined};
  await assert.rejects(()=>reconnect.save(selectRecovery(offline,remote)),/Черновик изменился/);
  assert.equal((await reconnect.save({...remote,title:'New edit'})).title,'New edit');
});

test('image upload and page save share a queue, which recovers after a failure',async()=>{
  const memory=gitMemory(),repo=make();repo.ready=true;let release,started;
  const gate=new Promise(resolve=>{release=resolve;}),uploadStarted=new Promise(resolve=>{started=resolve;});
  repo.request=async(path,options)=>{
    if(options?.method==='PUT'){started();await gate;memory.seed(path.slice('/contents/'.length),'image');return {};}
    return memory.request(path,options);
  };
  const upload=repo.upload(new File(['image'],'test.png',{type:'image/png'}));await uploadStarted;
  const save=repo.save(draft('ru'));await Promise.resolve();
  assert.equal(memory.requests.filter(r=>r.path===headPath).length,0);
  release();await upload;await save;
  assert.equal(memory.requests.filter(r=>r.path===refPath).length,1);
  await assert.rejects(()=>repo.upload(new File(['bad'],'test.txt',{type:'text/plain'})));
  const remote=await repo.load('page');assert.equal((await repo.save({...remote,title:'After failure'})).title,'After failure');
});

test('editor reconnect never substitutes remote commit for the local baseline',()=>{
  const source=readFileSync(new URL('../app/editor-app.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/working\.current\.commit\s*=\s*remote\.commit/);
  assert.match(source,/selectRecovery\(cached,draft,forceRemote\)/);
});
