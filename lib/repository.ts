import {DocNode} from './document';
import type {Locale} from './locales';
import {ensureImageIds,mergeImageNotes,collectImageNotes,stripImageNotes,imageIds,images,emptyImageNotes,type ImageNotes} from './image-notes';
export type RepoConfig={project:string;defaultBranch:string;token:string};
export const DRAFT_BRANCH='documentation-drafts';
export type Draft={id:string;locale?:Locale;title:string;content:DocNode;updated:string;baseHtml:string;publishedHtml?:string;commit?:string;notesCommit?:string|null;publishedImageIds?:string[];discardedAt?:string};
export const toBase64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
export const fromBase64=(s:string)=>Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0));
export const encodeText=(s:string)=>toBase64(new TextEncoder().encode(s));
export const decodeText=(s:string)=>new TextDecoder().decode(fromBase64(s));
export function normalizeConfig(input:RepoConfig):RepoConfig {
  const project=input.project.trim().replace(/^https:\/\/github.com\//,'').replace(/^\/+|\/+$/g,'').replace(/\.git$/,'');
  if(!/^[\w.-]+\/[\w.-]+$/.test(project))throw new Error('Укажите репозиторий в формате владелец/репозиторий');
  if(!input.token.trim())throw new Error('Введите токен GitHub для этого сеанса');
  return {...input,project,token:input.token.trim()};
}
export class Repository {
  config:RepoConfig;ready=false;
  constructor(config:RepoConfig){this.config=normalizeConfig(config);}
  async request(path:string,options:RequestInit={}):Promise<any>{
    let response:Response;try{response=await fetch('https://api.github.com/repos/'+this.config.project+path,{...options,headers:{Authorization:'Bearer '+this.config.token,Accept:'application/vnd.github+json','Content-Type':'application/json',...options.headers}});}catch{throw new Error('Не удалось связаться с GitHub. Проверьте подключение к сети.');}
    if(!response.ok){const e=new Error(response.status===401?'Токен GitHub недействителен или истёк':response.status===403?'У токена нет доступа к этому репозиторию':response.status===404?'Репозиторий или файл не найден':response.status===409||response.status===422?'Файл изменился в другом окне или защищён от записи. Ваши правки сохранены на устройстве.':`Ошибка GitHub (${response.status})`);Object.assign(e,{status:response.status});throw e;}
    return response.status===204?null:response.json();
  }
  async connect(){const project=await this.request('');this.config.defaultBranch=project.default_branch||this.config.defaultBranch||'main';if(project.permissions?.push===false)throw new Error('Для сохранения нужен доступ на запись в репозиторий');return project;}
  async ensureBranch(){if(this.ready)return;try{await this.request('/git/ref/heads/'+DRAFT_BRANCH);}catch(e){if((e as any).status!==404)throw e;const head=await this.request('/git/ref/heads/'+encodeURIComponent(this.config.defaultBranch));try{await this.request('/git/refs',{method:'POST',body:JSON.stringify({ref:'refs/heads/'+DRAFT_BRANCH,sha:head.object.sha})});}catch(err){if((err as any).status!==422)throw err;await this.request('/git/ref/heads/'+DRAFT_BRANCH);}}this.ready=true;}
  draftPath(id:string,locale:Locale='ru'){return 'editor-data/'+(locale==='en'?'en/':'')+'pages/'+id+'.json';}
  notesPath(id:string,locale:Locale='ru'){return 'editor-data/'+(locale==='en'?'en/':'')+'image-notes/'+id+'.json';}
  async file(path:string,ref=DRAFT_BRANCH){const f=await this.request('/contents/'+path+'?ref='+encodeURIComponent(ref));if(f.content)return f;const blob=await this.request('/git/blobs/'+f.sha);return {...f,content:blob.content};}
  async optionalFile(path:string,ref=DRAFT_BRANCH){try{return await this.file(path,ref);}catch(e){if((e as any).status===404)return null;throw e;}}
  async notes(id:string,locale:Locale='ru',ref=DRAFT_BRANCH){
    await this.ensureBranch();const file=await this.optionalFile(this.notesPath(id,locale),ref);
    return {state:file?JSON.parse(decodeText(file.content)) as ImageNotes:emptyImageNotes(),sha:file?.sha||null};
  }
  async attachNotes(draft:Draft,ref=DRAFT_BRANCH):Promise<Draft>{
    const notes=await this.notes(draft.id,draft.locale,ref);
    const content=await ensureImageIds(draft.content,path=>this.image(path));
    return {...draft,content:mergeImageNotes(content,notes.state),notesCommit:notes.sha,publishedImageIds:notes.state.publishedImageIds,discardedAt:notes.state.discardedAt};
  }
  async load(id:string,locale:Locale='ru'):Promise<Draft|null>{
    await this.ensureBranch();const head=await this.request('/git/ref/heads/'+DRAFT_BRANCH);
    const file=await this.optionalFile(this.draftPath(id,locale),head.object.sha);
    return file?this.attachNotes({...JSON.parse(decodeText(file.content)),locale,commit:file.sha},head.object.sha):null;
  }
  private async writeState(draft:Draft,content:DocNode,discard=false):Promise<Draft>{
    await this.ensureBranch();const head=(await this.request('/git/ref/heads/'+DRAFT_BRANCH)).object.sha;
    const path=this.draftPath(draft.id,draft.locale),notePath=this.notesPath(draft.id,draft.locale);
    const [existing,notes,commit]=await Promise.all([this.optionalFile(path,head),this.notes(draft.id,draft.locale,head),this.request('/git/commits/'+head)]);
    if((existing?.sha||undefined)!==draft.commit||(draft.notesCommit!==undefined&&notes.sha!==draft.notesCommit))throw new Error('Черновик или заметки изменились на другом устройстве. Откройте страницу заново перед сохранением.');
    const normalized=await ensureImageIds(content,p=>this.image(p));
    // Migrate inline legacy notes before pruning or replacing the draft file.
    if(existing){
      const legacy=await ensureImageIds(JSON.parse(decodeText(existing.content)).content,p=>this.image(p));
      for(const node of images(legacy))if(node.attrs?.scriptNote&&!Object.hasOwn(notes.state.notes,node.attrs.imageId))notes.state.notes[node.attrs.imageId]=node.attrs.scriptNote;
    }
    let state=collectImageNotes(notes.state,normalized,draft.publishedImageIds??notes.state.publishedImageIds);
    if(discard){
      // Keep the latest unsaved note edits, but only for images in the published page.
      const edits=await ensureImageIds(draft.content,p=>this.image(p));
      const all=collectImageNotes(notes.state,edits,imageIds(normalized));
      state={notes:Object.fromEntries(imageIds(normalized).map(id=>[id,all.notes[id]||''])),publishedImageIds:imageIds(normalized),discardedAt:new Date().toISOString()};
    }
    const payload={...draft,content:storedDocument(stripImageNotes(normalized))};
    delete payload.commit;delete payload.notesCommit;delete payload.publishedImageIds;delete payload.discardedAt;
    const noteBlob=await this.request('/git/blobs',{method:'POST',body:JSON.stringify({encoding:'utf-8',content:JSON.stringify(state)})});
    const entries:any[]=[{path:notePath,mode:'100644',type:'blob',sha:noteBlob.sha}];
    let draftSha:string|undefined;
    if(discard){if(existing)entries.push({path,mode:'100644',type:'blob',sha:null});}
    else{const blob=await this.request('/git/blobs',{method:'POST',body:JSON.stringify({encoding:'utf-8',content:JSON.stringify(payload)})});draftSha=blob.sha;entries.push({path,mode:'100644',type:'blob',sha:blob.sha});}
    const tree=await this.request('/git/trees',{method:'POST',body:JSON.stringify({base_tree:commit.tree.sha,tree:entries})});
    const next=await this.request('/git/commits',{method:'POST',body:JSON.stringify({message:(discard?'Удалить черновик: ':'Черновик: ')+draft.title+' [skip ci]',tree:tree.sha,parents:[head]})});
    await this.request('/git/refs/heads/'+DRAFT_BRANCH,{method:'PATCH',body:JSON.stringify({sha:next.sha,force:false})});
    return {...payload,content:mergeImageNotes(normalized,state),commit:draftSha,notesCommit:noteBlob.sha,publishedImageIds:state.publishedImageIds,discardedAt:state.discardedAt};
  }
  async save(draft:Draft,expectedSha=draft.commit):Promise<Draft>{return this.writeState({...draft,commit:expectedSha},draft.content);}
  async deleteDraft(draft:Draft,published:Draft):Promise<Draft>{
    const restored=await this.writeState(draft,published.content,true);
    return {...published,content:restored.content,notesCommit:restored.notesCommit,publishedImageIds:restored.publishedImageIds,discardedAt:restored.discardedAt};
  }
  async history(id:string,locale:Locale='ru'){await this.ensureBranch();return this.request('/commits?sha='+DRAFT_BRANCH+'&path='+encodeURIComponent(this.draftPath(id,locale))+'&per_page=30');}
  async revision(id:string,sha:string,locale:Locale='ru'){const file=await this.file(this.draftPath(id,locale),sha);return this.attachNotes({...JSON.parse(decodeText(file.content)),locale},sha);}
  async upload(file:File){
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('Выберите PNG, JPG, WebP или GIF');if(file.size>5*1024*1024)throw new Error('Максимальный размер изображения — 5 МБ');
    await this.ensureBranch();const data=toBase64(new Uint8Array(await file.arrayBuffer())),path='editor-assets/'+crypto.randomUUID()+'.'+(file.type==='image/jpeg'?'jpg':file.type.split('/')[1]);
    await this.request('/contents/'+path,{method:'PUT',body:JSON.stringify({branch:DRAFT_BRANCH,content:data,message:'Добавить изображение [skip ci]'})});return {src:`data:${file.type};base64,${data}`,assetPath:path,alt:file.name};
  }
  async image(path:string){if(!/^editor-assets\/[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(path))throw new Error('Некорректный путь изображения');const file=await this.file(path),ext=path.split('.').pop();return `data:image/${ext==='jpg'?'jpeg':ext};base64,${file.content.replace(/\s/g,'')}`;}
  async hydrate(doc:DocNode){const copy=structuredClone(doc),tasks:Promise<void>[]=[];const visit=(node:DocNode)=>{if(node.type==='image'&&node.attrs?.assetPath)tasks.push(this.image(node.attrs.assetPath).then(src=>{node.attrs!.src=src;}));node.content?.forEach(visit);};visit(copy);await Promise.all(tasks);return copy;}
}
export function storedDocument(doc:DocNode){const copy=structuredClone(doc);const visit=(node:DocNode)=>{if(node.type==='image'&&node.attrs?.assetPath)node.attrs.src='';node.content?.forEach(visit);};visit(copy);return copy;}
