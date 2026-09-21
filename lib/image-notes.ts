import type {DocNode} from './document';

export type ImageNotes={notes:Record<string,string>;publishedImageIds:string[];discardedAt?:string};
export const emptyImageNotes=():ImageNotes=>({notes:{},publishedImageIds:[]});
export function images(doc:DocNode):DocNode[]{
  const result:DocNode[]=[];
  const visit=(node:DocNode)=>{if(node.type==='image')result.push(node);node.content?.forEach(visit);};
  visit(doc);return result;
}
export const imageIds=(doc:DocNode)=>images(doc).map(n=>String(n.attrs?.imageId||'')).filter(Boolean);
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),b=>b.toString(16).padStart(2,'0')).join('');

/** Legacy IDs match across base64 drafts and their content-addressed published images. */
export async function ensureImageIds(source:DocNode,resolve?:(path:string)=>Promise<string>){
  const doc=structuredClone(source),used=new Set<string>(),occurrences=new Map<string,number>();
  for(const node of images(doc)){
    const attrs=node.attrs??={};
    if(typeof attrs.imageId==='string'&&attrs.imageId&&!used.has(attrs.imageId)){used.add(attrs.imageId);continue;}
    let src=String(attrs.src||'');
    if(!src&&attrs.assetPath&&resolve)src=await resolve(attrs.assetPath);
    const data=src.match(/^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/);
    if(data)src='img/editor/'+await hash(Uint8Array.from(atob(data[2]),c=>c.charCodeAt(0)))+'.'+(data[1]==='jpeg'?'jpg':data[1]);
    const asset=src.match(/(?:^|\/)(img\/editor\/[a-f0-9]{64}\.(?:png|jpg|gif|webp))(?:[?#].*)?$/);
    const key=asset?.[1]||src||String(attrs.assetPath||'image');
    const identity=(await hash(new TextEncoder().encode(key))).slice(0,24);
    let occurrence=occurrences.get(identity)||0,id:string;
    do{id='image-'+identity+'-'+(++occurrence);}while(used.has(id));
    occurrences.set(identity,occurrence);attrs.imageId=id;used.add(id);
  }
  return doc;
}
export function mergeImageNotes(source:DocNode,state:ImageNotes){
  const doc=structuredClone(source);
  for(const node of images(doc)){
    const attrs=node.attrs??={};
    if(Object.hasOwn(state.notes,attrs.imageId))attrs.scriptNote=state.notes[attrs.imageId];
    else attrs.scriptNote=typeof attrs.scriptNote==='string'?attrs.scriptNote:'';
  }
  return doc;
}
export function collectImageNotes(previous:ImageNotes,doc:DocNode,publishedIds=previous.publishedImageIds):ImageNotes{
  const keep=new Set([...imageIds(doc),...publishedIds]);
  const notes=Object.fromEntries(Object.entries(previous.notes).filter(([id])=>keep.has(id)));
  for(const node of images(doc))notes[node.attrs!.imageId]=String(node.attrs?.scriptNote||'');
  return {...previous,notes,publishedImageIds:publishedIds};
}
export function stripImageNotes(source:DocNode){
  const doc=structuredClone(source);for(const node of images(doc))if(node.attrs)delete node.attrs.scriptNote;return doc;
}
