import {draftKey,type Locale} from './locales';
import type {Draft} from './repository';
import {ensureImageIds,collectImageNotes,emptyImageNotes,stripImageNotes,mergeImageNotes} from './image-notes';
let pending:Promise<IDBDatabase>|null=null;
function db(){return pending??=new Promise((resolve,reject)=>{
  const req=indexedDB.open('cloudpayments-editor-recovery',2);
  req.onupgradeneeded=()=>{for(const name of ['drafts','image-notes'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name);};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
export async function cacheDraft(draft:Draft){
  const content=await ensureImageIds(draft.content),d=await db(),key=draftKey(draft.id,draft.locale);
  return new Promise<void>((resolve,reject)=>{
    const tx=d.transaction(['drafts','image-notes'],'readwrite'),notes=tx.objectStore('image-notes');
    const request=notes.get(key);request.onsuccess=()=>{
      notes.put(collectImageNotes(request.result||emptyImageNotes(),content,draft.publishedImageIds),key);
      tx.objectStore('drafts').put({...draft,content:stripImageNotes(content)},key);
    };tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
}
export async function recoverDraft(id:string,locale:Locale='ru'):Promise<Draft|null>{
  const d=await db(),key=draftKey(id,locale);
  return new Promise((resolve,reject)=>{
    const tx=d.transaction(['drafts','image-notes']),draft=tx.objectStore('drafts').get(key),notes=tx.objectStore('image-notes').get(key);
    tx.oncomplete=()=>resolve(draft.result?{...draft.result,content:mergeImageNotes(draft.result.content,notes.result||emptyImageNotes())}:null);tx.onerror=()=>reject(tx.error);
  });
}
export async function deleteCachedDraft(id:string,locale:Locale='ru',published?:Draft){
  const d=await db(),key=draftKey(id,locale);
  return new Promise<void>((resolve,reject)=>{
    const tx=d.transaction(['drafts','image-notes'],'readwrite');tx.objectStore('drafts').delete(key);
    if(published)tx.objectStore('image-notes').put(collectImageNotes(emptyImageNotes(),published.content,published.publishedImageIds),key);
    else tx.objectStore('image-notes').delete(key);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
}
