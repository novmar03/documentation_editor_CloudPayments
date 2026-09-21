import test from 'node:test';
import assert from 'node:assert/strict';
import {Schema} from '@tiptap/pm/model';
import {EditorState,NodeSelection} from '@tiptap/pm/state';
import {replaceSelectedImage} from '../lib/replace-image.ts';

const schema=new Schema({nodes:{doc:{content:'block*'},text:{group:'inline'},paragraph:{group:'block',content:'text*'},image:{group:'block',atom:true,attrs:{imageId:{default:null},src:{default:''},assetPath:{default:null},alt:{default:''},width:{default:100},align:{default:'center'}}}}});
const image=id=>({type:'image',attrs:{imageId:id,src:id+'.png',alt:id,width:65,align:'left'}});
function editor(){
  const doc=schema.nodeFromJSON({type:'doc',content:[image('first'),image('second')]});
  let listener;
  const ed={state:EditorState.create({doc,selection:NodeSelection.create(doc,0)}),isDestroyed:false,
    on:(_,fn)=>{listener=fn;},off:()=>{listener=undefined;},
    view:{dispatch(tr){ed.state=ed.state.apply(tr);listener?.({transaction:tr});}},
  };
  return ed;
}
test('replacement follows the original image and preserves its identity and current layout',async()=>{
  const ed=editor();let finish;
  const pending=replaceSelectedImage(ed,()=>new Promise(resolve=>{finish=resolve;}));
  ed.view.dispatch(ed.state.tr.insert(0,schema.nodes.paragraph.create()));
  ed.view.dispatch(ed.state.tr.setNodeMarkup(2,undefined,{...ed.state.doc.nodeAt(2).attrs,width:80,align:'right'}));
  ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc,3)));
  finish({imageId:'upload-id',src:'replacement.png',assetPath:'editor-assets/5678.png',alt:'Replacement'});
  assert.equal(await pending,true);
  assert.deepEqual({...ed.state.doc.nodeAt(2).attrs},{imageId:'first',src:'replacement.png',assetPath:'editor-assets/5678.png',alt:'Replacement',width:80,align:'right'});
  assert.equal(ed.state.doc.nodeAt(3).attrs.src,'second.png');
});
test('deleting an image during upload does not replace the next image',async()=>{
  const ed=editor();let finish;
  const pending=replaceSelectedImage(ed,()=>new Promise(resolve=>{finish=resolve;}));
  ed.view.dispatch(ed.state.tr.delete(0,1));finish({src:'replacement.png'});
  assert.equal(await pending,false);
  assert.equal(ed.state.doc.childCount,1);
  assert.equal(ed.state.doc.firstChild.attrs.src,'second.png');
});
