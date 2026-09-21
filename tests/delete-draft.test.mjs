import test from 'node:test';
import assert from 'node:assert/strict';
import {Repository} from '../lib/repository.ts';
import {imageIds,ensureImageIds,stripImageNotes} from '../lib/image-notes.ts';
import {preparePublishedDocument} from '../lib/image-assets.ts';
import {renderDocument} from '../lib/document.ts';
import {loadPublishedPage} from '../lib/published-page.ts';
import {gitMemory} from './git-memory.mjs';

const image=(imageId,scriptNote,src='https://example.com/'+imageId+'.png')=>({type:'image',attrs:{imageId,scriptNote,src,alt:imageId}});
const doc=(...content)=>({type:'doc',content});
function device(memory){const repo=new Repository({project:'test/editor',defaultBranch:'main',token:'test'});repo.ready=true;repo.request=memory.request;return repo;}
const draft=(content,locale='ru')=>({id:'tech/api',locale,title:'Published title',content,baseHtml:'',updated:new Date().toISOString()});

for(const locale of ['ru','en'])test('delete draft restores latest published '+locale+' content and only notes for its stable image IDs',async()=>{
  const memory=gitMemory(),repo=device(memory);
  let saved=await repo.save(draft(doc(image('a','old a'),{type:'carousel',content:[image('b','keep b')]}),locale));
  const prepared=await preparePublishedDocument(saved.content),html=renderDocument(prepared.doc);
  saved=await repo.save({...saved,baseHtml:html,publishedHtml:html,publishedImageIds:imageIds(saved.content)});
  assert(!JSON.stringify(memory.json(repo.draftPath(saved.id,locale))).includes('scriptNote'));
  assert.equal(memory.json(repo.notesPath(saved.id,locale)).notes.a,'old a');
  // Remove a published image, replace and move another, and introduce a draft-only image.
  saved=await repo.save({...saved,title:'Unpublished title',content:doc(image('draft-only','remove me'),{type:'paragraph',content:[{type:'text',text:'unpublished change'}]},image('a','saved a','https://example.com/replaced.png'))});
  const staleDevice=await device(memory).load(saved.id,locale);
  saved.content.content[2].attrs.scriptNote='latest unsaved a';
  // The published title changed elsewhere since this editor loaded its original page.
  const page={title:'Latest published title',html},data={pages:locale==='ru'?{[saved.id]:page}:{[saved.id]:{title:'Russian',html:''}},translations:{en:{pages:locale==='en'?{[saved.id]:page}:{}}}};
  const files={'index.html':'<script id="document-data" type="application/json">'+JSON.stringify(data)+'</script>',['src/content/editor-pages'+(locale==='en'?'.en':'')+'.json']:JSON.stringify({[saved.id]:{...page,content:prepared.doc}})};
  const refs=[];
  const pub={config:{branch:'main'},api:async()=>({object:{sha:'latest-publication'}}),file:async(path,ref)=>{refs.push(ref);return files[path]?{content:files[path]}:null;}};
  const published=await loadPublishedPage(pub,saved.id,locale,()=>{throw Error('Structured published content should be used');});
  assert(refs.every(ref=>ref==='latest-publication'));
  const restored=await repo.deleteDraft(saved,published);
  assert.equal(restored.title,'Latest published title');
  assert.equal(restored.content.content[0].attrs.src,'https://example.com/a.png');
  assert.equal(restored.content.content[0].attrs.scriptNote,'latest unsaved a');
  assert.equal(restored.content.content[1].content[0].attrs.scriptNote,'keep b');
  assert.deepEqual(stripImageNotes(restored.content),stripImageNotes(published.content));
  assert.equal(await device(memory).load(saved.id,locale),null);
  const notes=memory.json(repo.notesPath(saved.id,locale));
  assert.deepEqual(notes.notes,{a:'latest unsaved a',b:'keep b'});
  assert(notes.discardedAt);
  const anotherDevice=await device(memory).attachNotes(published);
  assert.deepEqual(anotherDevice.content,restored.content);
  await assert.rejects(()=>device(memory).save(staleDevice),/изменились/);
  assert.deepEqual(memory.json(repo.notesPath(saved.id,locale)).notes,notes.notes);
  // Restored state can be edited and saved again; notes remain separate.
  await repo.save({...restored,title:'Next draft'});
  assert.equal((await repo.load(saved.id,locale)).content.content[0].attrs.scriptNote,'latest unsaved a');
  assert(!JSON.stringify(memory.json(repo.draftPath(saved.id,locale))).includes('latest unsaved a'));
});

test('legacy inline notes migrate atomically and image identities match their published assets',async()=>{
  const memory=gitMemory(),repo=device(memory),legacy=draft(doc({type:'image',attrs:{src:'data:image/png;base64,AQID',scriptNote:'legacy note'}}));
  memory.seed(repo.draftPath(legacy.id),legacy);
  const loaded=await repo.load(legacy.id),prepared=await preparePublishedDocument(legacy.content);
  const published={...legacy,content:await ensureImageIds(prepared.doc)};
  assert.deepEqual(imageIds(loaded.content),imageIds(published.content));
  const saved=await repo.save({...loaded,publishedImageIds:imageIds(published.content)});
  assert(!JSON.stringify(memory.json(repo.draftPath(legacy.id))).includes('scriptNote'));
  assert.equal(memory.json(repo.notesPath(legacy.id)).notes[imageIds(loaded.content)[0]],'legacy note');
  // Also preserve the note if the author deleted this published image before discarding changes.
  const edited=await repo.save({...saved,content:doc({type:'paragraph'})});
  const restored=await repo.deleteDraft(edited,published);
  assert.equal(restored.content.content[0].attrs.scriptNote,'legacy note');
});

test('failed deletion leaves both draft and notes unchanged; stale notes cannot overwrite newer edits',async()=>{
  const memory=gitMemory(),repo=device(memory),saved=await repo.save(draft(doc(image('a','saved'))));
  const published={...saved,commit:undefined,content:stripImageNotes(saved.content)};
  const before=memory.head;
  repo.request=async(path,options)=>{if(path==='/git/refs/heads/documentation-drafts')throw Error('Network failure');return memory.request(path,options);};
  await assert.rejects(()=>repo.deleteDraft(saved,published),/Network failure/);
  assert.equal(memory.head,before);assert.equal((await device(memory).load(saved.id)).content.content[0].attrs.scriptNote,'saved');
  const changed=device(memory);await changed.save({...saved,content:doc(image('a','newer'))});
  await assert.rejects(()=>changed.deleteDraft(saved,published),/изменились/);
  assert.equal((await changed.load(saved.id)).content.content[0].attrs.scriptNote,'newer');
});

test('duplicate images receive distinct IDs and retain them across reorder and URL replacement',async()=>{
  const initial=await ensureImageIds(doc(image(null,'one','same.png'),image(null,'two','same.png')));
  assert.equal(new Set(imageIds(initial)).size,2);
  const ids=imageIds(initial);initial.content.reverse();initial.content[0].attrs.src='new.png';
  assert.deepEqual(imageIds(await ensureImageIds(initial)),ids.reverse());
});
