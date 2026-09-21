import test from 'node:test';
import assert from 'node:assert/strict';

test('IndexedDB upgrade removes only the retired store and keeps RU/EN draft recovery',async()=>{
  const legacy={id:'page',title:'Title',updated:'now',baseHtml:'',commit:'current',notesCommit:'old',content:{type:'doc',content:[{type:'image',attrs:{imageId:'one',src:'one.png',alt:'Alt',scriptNote:'obsolete'}}]}};
  const records=new Map([['page',legacy],['en/page',{...legacy,locale:'en',title:'English'}]]);
  const stores=new Map([['drafts',records],['image-notes',new Map()]]),opened=[],transactions=[];
  let blockNext=false,closed=0;
  const db={
    objectStoreNames:{contains:name=>stores.has(name)},
    createObjectStore:name=>stores.set(name,new Map()),
    deleteObjectStore:name=>stores.delete(name),
    transaction(name,mode){
      assert.equal(name,'drafts');transactions.push({name,mode});
      const tx={objectStore(store){assert.equal(store,'drafts');return {
        get(key){return {result:structuredClone(records.get(key))};},
        put(value,key){records.set(key,structuredClone(value));},
      };}};
      queueMicrotask(()=>tx.oncomplete?.());return tx;
    },
    close(){closed++;},
  };
  const previous=globalThis.indexedDB;
  globalThis.indexedDB={open(name,version){
    opened.push({name,version});const req={result:db};
    queueMicrotask(()=>{if(blockNext){blockNext=false;req.onblocked();req.onsuccess();}else{req.onupgradeneeded();req.onsuccess();}});return req;
  }};
  try{
    const {recoverDraft,cacheDraft}=await import('../lib/recovery.ts');
    const recovered=await recoverDraft('page');
    assert.deepEqual(opened,[{name:'cloudpayments-editor-recovery',version:3}]);
    assert.deepEqual([...stores.keys()],['drafts']);
    assert.equal(records.get('page'),legacy);
    assert.equal(recovered.commit,'current');
    assert.equal(recovered.content.content[0].attrs.alt,'Alt');
    assert.equal(recovered.content.content[0].attrs.scriptNote,undefined);
    assert.equal((await recoverDraft('page','en')).title,'English');
    await cacheDraft({...legacy,title:'Changed'});
    assert.equal((await recoverDraft('page')).title,'Changed');
    assert(!JSON.stringify(records.get('page')).includes('obsolete'));
    assert.equal((await recoverDraft('page','en')).title,'English');
    assert.equal(await recoverDraft('missing'),null);
    assert(transactions.some(t=>t.mode==='readwrite'));
    db.onversionchange();blockNext=true;
    await assert.rejects(()=>recoverDraft('page'),/Закройте другие вкладки/);
    assert.equal(closed,2);
    assert.equal((await recoverDraft('page')).title,'Changed');
  }finally{globalThis.indexedDB=previous;}
});
