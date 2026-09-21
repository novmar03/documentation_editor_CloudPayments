import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {encodeText} from '../lib/repository.ts';

/** Minimal immutable Git object store shared by independent Repository instances. */
export function gitMemory(){
  let sequence=0,head='initial';const blobs=new Map(),trees=new Map([['empty',{}]]),commits=new Map([['initial',{tree:{sha:'empty'},parents:[]}]]),requests=[];
  const error=status=>Object.assign(new Error('Git '+status),{status});
  const blob=content=>{const sha=createHash('sha256').update(content).digest('hex');blobs.set(sha,content);return sha;};
  const read=(path,ref=head)=>{const sha=trees.get(commits.get(ref).tree.sha)[path];if(!sha)throw error(404);return {sha,content:encodeText(blobs.get(sha))};};
  const request=async(path,options={})=>{
    const body=options.body?JSON.parse(options.body):null;requests.push({path,body});
    if(path==='/git/ref/heads/documentation-drafts')return {object:{sha:head}};
    if(path.startsWith('/contents/')){const [name,query]=path.slice(10).split('?');let ref=new URLSearchParams(query).get('ref');if(ref==='documentation-drafts')ref=head;return read(name,ref||head);}
    if(path==='/git/blobs')return {sha:blob(body.content)};
    if(path==='/git/trees'){
      const tree={...trees.get(body.base_tree)};
      for(const entry of body.tree){if(entry.sha===null)delete tree[entry.path];else tree[entry.path]=entry.sha;}
      const sha='tree-'+(++sequence);trees.set(sha,tree);return {sha};
    }
    if(path==='/git/commits'){const sha='commit-'+(++sequence);commits.set(sha,{tree:{sha:body.tree},parents:body.parents});return {sha};}
    if(path.startsWith('/git/commits/'))return commits.get(path.slice(13));
    if(path==='/git/refs/heads/documentation-drafts'){
      assert.equal(body.force,false);if(commits.get(body.sha).parents[0]!==head)throw error(409);head=body.sha;return {};
    }
    if(path.startsWith('/commits?'))return [];
    throw new Error('Unexpected request '+path);
  };
  return {request,requests,get head(){return head;},read,json:path=>JSON.parse(blobs.get(trees.get(commits.get(head).tree.sha)[path])),
    seed(path,value){const tree={...trees.get(commits.get(head).tree.sha),[path]:blob(JSON.stringify(value))};const sha='seed-'+(++sequence);trees.set(sha,tree);commits.set(sha,{tree:{sha},parents:[head]});head=sha;},
  };
}
