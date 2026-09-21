import test from 'node:test';
import assert from 'node:assert/strict';
import {Schema} from '@tiptap/pm/model';
import {EditorState,NodeSelection} from '@tiptap/pm/state';
import {Repository,storedDocument} from '../lib/repository.ts';
import {Publisher} from '../lib/publish.ts';
import {replaceSelectedImage} from '../lib/replace-image.ts';
import {renderDocument} from '../lib/document.ts';
import {ensureImageIds} from '../lib/image-notes.ts';
import {gitMemory} from './git-memory.mjs';

const note='private-image-note: <script> source\nРусский текст';
const image=(scriptNote=note)=>({type:'image',attrs:{imageId:scriptNote===note?'first-image':'second-image',src:'data:image/png;base64,AQID',assetPath:'editor-assets/1234.png',alt:'Image',scriptNote}});

test('GitHub save → publish → another device preserves notes, while every public write excludes them (RU/EN)',async()=>{
  const remote=gitMemory();
  function device(){
    const repo=new Repository({project:'test/editor',defaultBranch:'main',token:'test'});repo.ready=true;
    repo.request=remote.request;
    repo.image=async()=>image().attrs.src;
    return repo;
  }
  for(const locale of ['ru','en']){
    const first=device(),source=await ensureImageIds({type:'doc',content:[image(),{type:'carousel',content:[image('second-private-note')]}]});
    const saved=await first.save({id:'tech/api',locale,title:'API',content:storedDocument(source),baseHtml:'',updated:'2026-09-21'});
    const oldOverlay={'old/page':{content:source}};
    const data={pages:{'tech/api':{html:'',content:source}},groups:[]};
    const files={
      'index.html':'<script id="document-data" type="application/json">'+JSON.stringify(data)+'</script>',
      'src/content/editor-pages.json':JSON.stringify(oldOverlay),
      'src/content/editor-pages.en.json':JSON.stringify(oldOverlay),
      'scripts/export-html.py':'EDITOR_PAGES_FILE','sidebars.js':'editorPagesPath',
    };
    const publisher=new Publisher({provider:'github',project:'test/docs',branch:'main',host:'',token:'test'}),writes=[];
    publisher.file=async path=>files[path]?{content:files[path],sha:'old'}:null;
    publisher.api=async(path,options={})=>{
      if(path.startsWith('/git/ref/heads/'))return {object:{sha:'parent'}};
      if(path==='/git/commits/parent')return {tree:{sha:'base'}};
      if(path==='/git/blobs'){writes.push(JSON.parse(options.body));return {sha:'blob-'+writes.length};}
      return {sha:'commit'};
    };
    const result=await publisher.publish(saved,await first.hydrate(saved.content));
    await first.save({...saved,publishedHtml:result.html},saved.commit);
    const second=device(),loaded=await second.load('tech/api',locale),hydrated=await second.hydrate(loaded.content);
    assert.deepEqual(hydrated,source);
    for(const write of writes.filter(w=>w.encoding==='utf-8')){
      assert(!write.content.includes('scriptNote'));
      assert(!write.content.includes('private-note'));
      assert(!write.content.includes('private-image-note'));
      assert(!write.content.includes('assetPath'));
    }
    assert(!renderDocument(hydrated).includes('private-image-note'));
    // Reordering carries the node and its note; deletion removes both from current state.
    hydrated.content.reverse();
    const moved=await second.save({...loaded,content:storedDocument(hydrated)},loaded.commit);
    assert.equal((await device().load('tech/api',locale)).content.content[1].attrs.scriptNote,note);
    hydrated.content.pop();
    await second.save({...moved,content:storedDocument(hydrated)},moved.commit);
    assert(!JSON.stringify((await device().load('tech/api',locale)).content).includes('private-image-note'));
  }
});

const schema=new Schema({nodes:{doc:{content:'block*'},text:{group:'inline'},paragraph:{group:'block',content:'text*'},image:{group:'block',atom:true,attrs:{imageId:{default:null},src:{default:''},assetPath:{default:null},alt:{default:''},scriptNote:{default:''}}}}});
function editor(){
  const doc=schema.nodeFromJSON({type:'doc',content:[image(),image('other')]});
  let listener;
  const ed={state:EditorState.create({doc,selection:NodeSelection.create(doc,0)}),isDestroyed:false,
    on:(_,fn)=>{listener=fn;},off:()=>{listener=undefined;},
    view:{dispatch(tr){ed.state=ed.state.apply(tr);listener?.({transaction:tr});}},
  };
  return ed;
}
test('image replacement retains latest note despite selection and document changes during upload',async()=>{
  const ed=editor();let finish;
  const pending=replaceSelectedImage(ed,()=>new Promise(resolve=>{finish=resolve;}));
  ed.view.dispatch(ed.state.tr.insert(0,schema.nodes.paragraph.create()));
  ed.view.dispatch(ed.state.tr.setNodeMarkup(2,undefined,{...ed.state.doc.nodeAt(2).attrs,scriptNote:'edited while uploading'}));
  ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc,3)));
  finish({imageId:'upload-id',src:'replacement.png',assetPath:'editor-assets/5678.png',alt:'Replacement'});
  assert.equal(await pending,true);
  assert.equal(ed.state.doc.nodeAt(2).attrs.src,'replacement.png');
  assert.equal(ed.state.doc.nodeAt(2).attrs.scriptNote,'edited while uploading');
  assert.equal(ed.state.doc.nodeAt(2).attrs.imageId,'first-image');
  assert.equal(ed.state.doc.nodeAt(3).attrs.scriptNote,'other');
});
test('deleting an image during upload does not transfer its note or replacement to the next image',async()=>{
  const ed=editor();let finish;
  const pending=replaceSelectedImage(ed,()=>new Promise(resolve=>{finish=resolve;}));
  ed.view.dispatch(ed.state.tr.delete(0,1));finish({src:'replacement.png'});
  assert.equal(await pending,false);
  assert.equal(ed.state.doc.childCount,1);
  assert.equal(ed.state.doc.firstChild.attrs.scriptNote,'other');
  assert.notEqual(ed.state.doc.firstChild.attrs.src,'replacement.png');
});
