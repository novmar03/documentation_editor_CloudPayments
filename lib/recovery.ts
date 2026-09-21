import {draftKey,type Locale} from './locales';
import type {Draft} from './repository';
import {readDraft} from './draft-data';
let pending:Promise<IDBDatabase>|null=null;
function db(){return pending??=new Promise((resolve,reject)=>{
  const req=indexedDB.open('cloudpayments-editor-recovery',3);
  let blocked=false;
  req.onupgradeneeded=()=>{
    if(!req.result.objectStoreNames.contains('drafts'))req.result.createObjectStore('drafts');
    if(req.result.objectStoreNames.contains('image-notes'))req.result.deleteObjectStore('image-notes');
  };
  req.onblocked=()=>{blocked=true;pending=null;reject(new Error('Закройте другие вкладки редактора и обновите страницу, чтобы завершить обновление локального хранилища.'));};
  req.onsuccess=()=>{
    if(blocked){req.result.close();return;}
    req.result.onversionchange=()=>{req.result.close();pending=null;};resolve(req.result);
  };
  req.onerror=()=>{pending=null;reject(req.error);};
});}
export async function cacheDraft(draft:Draft){
  const d=await db(),key=draftKey(draft.id,draft.locale);
  return new Promise<void>((resolve,reject)=>{
    const tx=d.transaction('drafts','readwrite');
    tx.objectStore('drafts').put(readDraft(draft),key);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
}
export async function recoverDraft(id:string,locale:Locale='ru'):Promise<Draft|null>{
  const d=await db(),key=draftKey(id,locale);
  return new Promise((resolve,reject)=>{
    const tx=d.transaction('drafts'),draft=tx.objectStore('drafts').get(key);
    tx.oncomplete=()=>resolve(draft.result?readDraft(draft.result):null);tx.onerror=()=>reject(tx.error);
  });
}
