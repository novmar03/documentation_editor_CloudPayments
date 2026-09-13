import type {Draft} from './repository';
let pending:Promise<IDBDatabase>|null=null;
function db(){return pending??=new Promise((resolve,reject)=>{const req=indexedDB.open('cloudpayments-editor-recovery',1);req.onupgradeneeded=()=>req.result.createObjectStore('drafts');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function cacheDraft(draft:Draft){const d=await db();return new Promise<void>((resolve,reject)=>{const tx=d.transaction('drafts','readwrite');tx.objectStore('drafts').put(draft,draft.id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
export async function recoverDraft(id:string):Promise<Draft|null>{const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('drafts').objectStore('drafts').get(id);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}
