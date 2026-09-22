import test from 'node:test';
import assert from 'node:assert/strict';
import {Repository,DRAFT_BRANCH} from '../lib/repository.ts';
import {gitMemory} from './git-memory.mjs';

const refPath='/git/refs/heads/'+DRAFT_BRANCH;
const headPath='/git/ref/heads/'+DRAFT_BRANCH;
const draft=(id,locale='ru')=>({id,locale,title:id,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:id}]}]},baseHtml:'',updated:'2026-09-22'});
const device=memory=>{
  const repo=new Repository({project:'test/editor',defaultBranch:'main',token:'test'});
  repo.ready=true;repo.request=memory.request;return repo;
};
const writes=memory=>memory.requests.filter(r=>r.path===refPath);
function concurrentDevices(memory){
  let arrived=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  return [device(memory),device(memory)].map(repo=>{
    repo.request=async(path,options)=>{
      if(path===refPath&&arrived<2){if(++arrived===2)release();await gate;}
      return memory.request(path,options);
    };
    return repo;
  });
}

for(const locale of ['ru','en']){
  test('normal save returns the page blob SHA: '+locale,async()=>{
    const memory=gitMemory(),repo=device(memory),source=draft('checkout',locale);
    const saved=await repo.save(source);
    assert.equal(saved.commit,memory.read(repo.draftPath(source.id,locale)).sha);
    assert.equal(writes(memory).length,1);
    assert.deepEqual(source,draft('checkout',locale));
    assert.deepEqual(memory.requests.find(r=>r.path==='/git/trees').body.tree.map(e=>e.path),[repo.draftPath(source.id,locale)]);
  });
  test('different pages save concurrently and the next save uses the returned SHA: '+locale,async()=>{
    const memory=gitMemory(),setup=device(memory);
    const initial=await Promise.all(['checkout','api'].map(id=>setup.save(draft(id,locale))));
    memory.requests.length=0;
    const [a,b]=concurrentDevices(memory);
    const [savedA,savedB]=await Promise.all([a.save({...initial[0],title:'A'}),b.save({...initial[1],title:'B'})]);
    assert.equal(writes(memory).length,3);
    assert.equal((await a.load('checkout',locale)).title,'A');
    assert.equal((await b.load('api',locale)).title,'B');
    assert.equal(savedB.commit,memory.read(b.draftPath('api',locale)).sha);
    const next=await b.save({...savedB,title:'B again'});
    assert.equal(next.commit,memory.read(b.draftPath('api',locale)).sha);
    assert.notEqual(next.commit,savedB.commit);
    assert.equal(memory.read(a.draftPath('checkout',locale)).sha,savedA.commit);
    assert(memory.requests.filter(r=>r.path==='/git/trees').every(r=>r.body.tree.length===1));
  });
  test('same-page race stops on recheck without overwriting the winner: '+locale,async()=>{
    const memory=gitMemory(),base=await device(memory).save(draft('checkout',locale));
    memory.requests.length=0;
    const [a,b]=concurrentDevices(memory);
    const results=await Promise.allSettled([a.save({...base,title:'A'}),b.save({...base,title:'B'})]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.match(results.find(r=>r.status==='rejected').reason.message,/Черновик изменился на другом устройстве/);
    const winner=results.find(r=>r.status==='fulfilled').value;
    assert.equal((await a.load('checkout',locale)).title,winner.title);
    assert.equal(writes(memory).length,2);
    const attempts=writes(memory).length;
    await assert.rejects(()=>b.save({...base,title:'Stale'}),/Черновик изменился/);
    assert.equal(writes(memory).length,attempts);
  });
  test('image upload changes HEAD without blocking the current page: '+locale,async()=>{
    const memory=gitMemory(),repo=device(memory);let uploaded=false;
    repo.request=async(path,options)=>{
      if(path===refPath&&!uploaded){uploaded=true;memory.seed('editor-assets/1234.png','uploaded-image');}
      return memory.request(path,options);
    };
    const saved=await repo.save(draft('checkout',locale));
    assert.equal(writes(memory).length,2);
    assert.equal(memory.json('editor-assets/1234.png'),'uploaded-image');
    assert.equal(saved.commit,memory.read(repo.draftPath('checkout',locale)).sha);
    const parents=memory.requests.filter(r=>r.path==='/git/commits').map(r=>r.body.parents[0]);
    assert.notEqual(parents[0],parents[1]);
  });
}

test('continual branch races stop after exactly three total attempts',async()=>{
  const memory=gitMemory(),repo=device(memory);let changes=0;
  repo.request=async(path,options)=>{
    if(path===refPath)memory.seed('editor-assets/concurrent.png',++changes);
    return memory.request(path,options);
  };
  await assert.rejects(()=>repo.save(draft('checkout')),e=>e.status===409);
  assert.equal(changes,3);
  assert.equal(writes(memory).length,3);
  assert.equal(memory.requests.filter(r=>r.path===headPath).length,3);
  assert.equal(await device(memory).load('checkout'),null);
});

for(const path of [headPath,'/git/blobs',refPath]){
  for(const status of [401,403,undefined])test('no retry for '+(status||'network failure')+' at '+path,async()=>{
    const memory=gitMemory(),repo=device(memory);let calls=0;
    const error=Object.assign(new Error('Original failure'),{status,githubMessage:'Reference update failed'});
    repo.request=async(p,options)=>{if(p===path){calls++;throw error;}return memory.request(p,options);};
    await assert.rejects(()=>repo.save(draft('checkout')),e=>e===error);
    assert.equal(calls,1);
  });
}

for(const [path,status,message] of [
  ['/git/trees',422,'Update is not a fast forward'],
  [refPath,422,'Validation failed'],
  [refPath,422,'Protected branch update failed'],
  [refPath,422,'Reference update failed; Permission denied'],
  [refPath,409,'Git Repository is empty.'],
])test('no retry for unrelated failure: '+path+' '+message,async()=>{
  const memory=gitMemory(),repo=device(memory);let calls=0;
  const error=Object.assign(new Error(message),{status,githubMessage:message});
  repo.request=async(p,options)=>{if(p===path){calls++;throw error;}return memory.request(p,options);};
  await assert.rejects(()=>repo.save(draft('checkout')),e=>e===error);
  assert.equal(calls,1);
});

test('HTTP 422 non-fast-forward detail is retained and retried only at the ref update',async()=>{
  const memory=gitMemory(),repo=new Repository({project:'test/editor',defaultBranch:'main',token:'test'});
  repo.ready=true;const previous=globalThis.fetch;let raced=false,updates=0;
  globalThis.fetch=async(url,options)=>{
    const path=String(url).split('/repos/test/editor')[1];
    if(path===refPath){
      updates++;
      if(!raced){raced=true;memory.seed('editor-assets/1234.png','upload');return new Response(JSON.stringify({message:'Update is not a fast forward'}),{status:422});}
    }
    try{return new Response(JSON.stringify(await memory.request(path,options)),{status:200});}
    catch(error){return new Response(JSON.stringify({message:error.githubMessage||'Not Found'}),{status:error.status||500});}
  };
  try{
    const saved=await repo.save(draft('checkout'));
    assert.equal(updates,2);
    assert.equal(saved.commit,memory.read(repo.draftPath('checkout')).sha);
  }finally{globalThis.fetch=previous;}
});
