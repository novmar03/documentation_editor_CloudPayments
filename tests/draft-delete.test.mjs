import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Repository,DRAFT_BRANCH} from '../lib/github/repository.ts';

function mock(sha='current'){
 const repo=new Repository({project:'owner/editor',defaultBranch:'main',token:'test'}),calls=[];
 repo.request=async(path,options={})=>{calls.push({path,...options});if(options.method==='DELETE')return {};if(sha===null)throw Object.assign(new Error('Missing'),{status:404});return {sha};};
 return {repo,calls};
}
test('draft deletion targets only the draft branch and uses the loaded SHA',async()=>{
 const {repo,calls}=mock();await repo.remove('tech/api','current');
 assert.equal(calls.length,2);assert.equal(calls[1].path,'/contents/editor-data/pages/tech/api.json');
 const body=JSON.parse(calls[1].body);assert.equal(body.branch,DRAFT_BRANCH);assert.equal(body.sha,'current');assert.equal(calls[1].method,'DELETE');
});
test('a newer or unknown remote draft cannot be silently deleted',async()=>{
 for(const sha of ['outdated',undefined]){const {repo,calls}=mock();await assert.rejects(repo.remove('tech/api',sha),/изменился/);assert.equal(calls.length,1);}
});
test('already absent drafts need no write; deletion failures reach the caller',async()=>{
 const absent=mock(null);await absent.repo.remove('tech/api','old');assert.equal(absent.calls.length,1);
 const {repo}=mock();repo.request=async()=>{throw Object.assign(new Error('Forbidden'),{status:403});};await assert.rejects(repo.remove('tech/api','current'),/Forbidden/);
});
