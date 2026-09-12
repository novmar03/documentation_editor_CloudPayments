import {DocNode} from './document';
export type RepoConfig={project:string;defaultBranch:string;token:string};
export const DRAFT_BRANCH='documentation-drafts';
export type Draft={id:string;title:string;content:DocNode;updated:string;baseHtml:string;publishedHtml?:string;commit?:string};
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
  draftPath(id:string){return 'editor-data/pages/'+id+'.json';}
  async file(path:string,ref=DRAFT_BRANCH){const f=await this.request('/contents/'+path+'?ref='+encodeURIComponent(ref));if(f.content)return f;const blob=await this.request('/git/blobs/'+f.sha);return {...f,content:blob.content};}
  async load(id:string):Promise<Draft|null>{await this.ensureBranch();try{const file=await this.file(this.draftPath(id));return {...JSON.parse(decodeText(file.content)),commit:file.sha};}catch(e){if((e as any).status===404)return null;throw e;}}
  async save(draft:Draft,expectedSha?:string):Promise<Draft>{await this.ensureBranch();const payload={...draft};delete payload.commit;const result=await this.request('/contents/'+this.draftPath(draft.id),{method:'PUT',body:JSON.stringify({branch:DRAFT_BRANCH,content:encodeText(JSON.stringify(payload)),message:'Черновик: '+draft.title+' [skip ci]',...(expectedSha?{sha:expectedSha}:{})})});return {...payload,commit:result.content.sha};}
  async history(id:string){await this.ensureBranch();return this.request('/commits?sha='+DRAFT_BRANCH+'&path='+encodeURIComponent(this.draftPath(id))+'&per_page=30');}
  async revision(id:string,sha:string){const file=await this.file(this.draftPath(id),sha);return JSON.parse(decodeText(file.content)) as Draft;}
  async upload(file:File){
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('Выберите PNG, JPG, WebP или GIF');if(file.size>5*1024*1024)throw new Error('Максимальный размер изображения — 5 МБ');
    await this.ensureBranch();const data=toBase64(new Uint8Array(await file.arrayBuffer())),path='editor-assets/'+crypto.randomUUID()+'.'+(file.type==='image/jpeg'?'jpg':file.type.split('/')[1]);
    await this.request('/contents/'+path,{method:'PUT',body:JSON.stringify({branch:DRAFT_BRANCH,content:data,message:'Добавить изображение [skip ci]'})});return {src:`data:${file.type};base64,${data}`,assetPath:path,alt:file.name};
  }
  async image(path:string){if(!/^editor-assets\/[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(path))throw new Error('Некорректный путь изображения');const file=await this.file(path),ext=path.split('.').pop();return `data:image/${ext==='jpg'?'jpeg':ext};base64,${file.content.replace(/\s/g,'')}`;}
  async hydrate(doc:DocNode){const copy=structuredClone(doc),tasks:Promise<void>[]=[];const visit=(node:DocNode)=>{if(node.type==='image'&&node.attrs?.assetPath)tasks.push(this.image(node.attrs.assetPath).then(src=>{node.attrs!.src=src;}));if(node.type==='carousel'&&Array.isArray(node.attrs?.slides))node.attrs.slides.forEach((slide:any)=>{if(slide.assetPath)tasks.push(this.image(slide.assetPath).then(src=>{slide.src=src;}));});node.content?.forEach(visit);};visit(copy);await Promise.all(tasks);return copy;}
}
export function storedDocument(doc:DocNode){const copy=structuredClone(doc);const visit=(node:DocNode)=>{if(node.type==='image'&&node.attrs?.assetPath)node.attrs.src='';if(node.type==='carousel'&&Array.isArray(node.attrs?.slides))node.attrs.slides.forEach((slide:any)=>{if(slide.assetPath)slide.src='';});node.content?.forEach(visit);};visit(copy);return copy;}
