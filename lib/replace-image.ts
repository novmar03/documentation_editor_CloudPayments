import type {Editor} from '@tiptap/core';
import type {Transaction} from '@tiptap/pm/state';
import {ReplaceStep} from '@tiptap/pm/transform';

/** Track the selected image while upload is pending; never replace another selection. */
export async function replaceSelectedImage(editor:Editor,upload:()=>Promise<Record<string,unknown>>) {
  let position=editor.state.selection.from;
  if(editor.state.doc.nodeAt(position)?.type.name!=='image')return false;
  let removed=false;
  const track=({transaction}:{transaction:Transaction})=>{
    transaction.steps.forEach((step,index)=>{
      const before=transaction.docs[index].nodeAt(position);
      // ProseMirror represents a leaf's attribute edit as a replacement step.
      const replacement=step instanceof ReplaceStep?step.slice.content.firstChild:null;
      const metadataEdit=step instanceof ReplaceStep&&step.from===position&&step.to===position+1&&
        step.slice.size===1&&replacement?.type.name==='image'&&
        replacement.attrs.src===before?.attrs.src&&replacement.attrs.assetPath===before?.attrs.assetPath;
      if(metadataEdit)return;
      const mapped=step.getMap().mapResult(position,1);
      removed ||= mapped.deleted;
      position=mapped.pos;
    });
  };
  editor.on('transaction',track);
  try{
    const image=await upload();
    if(editor.isDestroyed||removed)return false;
    const node=editor.state.doc.nodeAt(position);
    if(node?.type.name!=='image')return false;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(position,undefined,{
      ...node.attrs,...image,imageId:node.attrs.imageId,scriptNote:node.attrs.scriptNote||'',
    }));
    return true;
  }finally{editor.off('transaction',track);}
}
