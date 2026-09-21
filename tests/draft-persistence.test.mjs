import test from 'node:test';
import assert from 'node:assert/strict';
import {Repository} from '../lib/repository.ts';
import {gitMemory} from './git-memory.mjs';

function device(memory){const repo=new Repository({project:'test/editor',defaultBranch:'main',token:'test'});repo.ready=true;repo.request=memory.request;return repo;}
const draft=locale=>({id:'tech/api',locale,title:'API',updated:'2026-09-21',baseHtml:'',content:{type:'doc',content:[{type:'image',attrs:{imageId:'image-a',src:'https://example.com/a.png',alt:'Original image',width:65,align:'left'}}]}});

for(const locale of ['ru','en'])test('draft creation, reopen, history restore and concurrent conflict protection: '+locale,async()=>{
  const memory=gitMemory(),repo=device(memory);
  assert.equal(await repo.load('tech/api',locale),null);
  let saved=await repo.save(draft(locale));
  const revision=memory.head;
  const reopened=await device(memory).load(saved.id,locale);
  assert.deepEqual(reopened.content,saved.content);
  saved=await repo.save({...reopened,title:'Updated title'});
  await assert.rejects(()=>device(memory).save({...reopened,title:'Stale edit'}),/изменился/);
  assert.equal((await repo.load(saved.id,locale)).title,'Updated title');
  const historical=await repo.revision(saved.id,revision,locale);
  assert.equal(historical.title,'API');
  assert.deepEqual(historical.content,draft(locale).content);
  saved=await repo.save({...saved,title:historical.title,content:historical.content});
  assert.equal((await device(memory).load(saved.id,locale)).title,'API');
  await repo.history(saved.id,locale);
  assert(memory.requests.some(r=>r.path.includes('/commits?')&&decodeURIComponent(r.path).includes(repo.draftPath(saved.id,locale))));
  assert(memory.requests.filter(r=>r.path==='/git/trees').every(r=>r.body.tree.every(entry=>entry.sha!==null)));
});

test('legacy draft fields are ignored without changing image content or revision protection',async()=>{
  const memory=gitMemory(),repo=device(memory),existing=draft('ru');
  const legacy=structuredClone(existing);
  legacy.content.content[0].attrs.scriptNote='obsolete value';
  Object.assign(legacy,{notesCommit:'obsolete-sha',publishedImageIds:['image-a'],discardedAt:'2026-09-01'});
  memory.seed(repo.draftPath(existing.id),legacy);
  const revision=memory.head;
  const loaded=await repo.load(existing.id);
  assert.deepEqual(loaded.content,existing.content);
  assert.equal(loaded.notesCommit,undefined);
  assert.equal(loaded.discardedAt,undefined);
  assert.deepEqual((await repo.revision(existing.id,revision)).content,existing.content);
  await repo.save(loaded);
  assert.deepEqual((await device(memory).load(existing.id)).content,existing.content);
  assert(!JSON.stringify(memory.json(repo.draftPath(existing.id))).includes('obsolete'));
  assert(!memory.requests.some(r=>r.path.includes('image-notes')));
  assert(memory.requests.filter(r=>r.path==='/git/trees').every(r=>r.body.tree.length===1));
});

test('failed save cannot partially change the draft',async()=>{
  const memory=gitMemory(),repo=device(memory),saved=await repo.save(draft('ru')),head=memory.head;
  repo.request=async(path,options)=>{if(path==='/git/refs/heads/documentation-drafts')throw Error('Network failure');return memory.request(path,options);};
  await assert.rejects(()=>repo.save({...saved,title:'Not committed'}),/Network failure/);
  assert.equal(memory.head,head);
  assert.equal((await device(memory).load(saved.id)).title,'API');
});
