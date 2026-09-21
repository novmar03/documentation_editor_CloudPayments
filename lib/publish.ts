import {DocNode,renderDocument,headings,normalizeHeadings} from './document';
import {Draft,decodeText} from './repository';
import {preparePublishedDocument,normalizePublishedImages} from './image-assets';
import {installOfflineLinks,installNativeLinks} from './documentation-links';
import {structurePaths,structureWrites} from './structure-publication';
import type {NavigationGroup} from './structure';
import {installCarouselHtml,installCarouselComponent,carouselRuntimeSource} from './carousel-publication';
import {withoutEditorMetadata} from './editor-metadata';
export type PublishConfig={provider:'github'|'gitlab';project:string;branch:string;host:string;token:string};
type RepoFile={content:string;sha:string};
export class Publisher {
  constructor(public config:PublishConfig){}
  async publishStructure(groups:NavigationGroup[],base:NavigationGroup[]){
    const c=this.config;if(!c.token.trim())throw new Error('Подключите GitHub для публикации структуры');
    if(c.provider!=='github')throw new Error('Публикация структуры доступна через GitHub');
    const head=await this.api('/git/ref/heads/'+encodeURIComponent(c.branch)),ref=head.object.sha;
    const loaded=await Promise.all(structurePaths.map(path=>this.file(path,ref)));
    const files:Record<string,string>={};structurePaths.forEach((path,i)=>{if(!loaded[i])throw new Error('Не найден файл документации: '+path);files[path]=loaded[i]!.content;});
    const writes=structureWrites(files,groups,base);
    // Do not overwrite an existing route which is absent from navigation.
    for(const path of Object.keys(writes).filter(p=>p.endsWith('.md')))if(await this.file(path,ref))throw new Error('Адрес уже занят существующей страницей: '+path);
    const oldTitles=new Map(base.flatMap(g=>g.items.filter(p=>p.type!=='category').map(p=>[p.id,p.title])));
    for(const page of groups.flatMap(g=>g.items).filter(p=>p.type!=='category'&&oldTitles.has(p.id)&&oldTitles.get(p.id)!==p.title)){
      const path='docs/'+page.id+'.md',file=await this.file(path,ref);
      if(!file)throw new Error('Не найдена страница для переименования: '+page.id);
      const front=file.content.match(/^---\r?\n[\s\S]*?\r?\n---/);
      if(!front)throw new Error('Не удалось обновить название страницы: '+page.id);
      const header=front[0].replace(/^title:.*\r?\n/m,'').replace(/^---\r?\n/,'---\ntitle: '+JSON.stringify(page.title)+'\n');
      writes[path]=header+file.content.slice(front[0].length);
    }
    const parent=await this.api('/git/commits/'+ref),tree=[];
    for(const [path,content] of Object.entries(writes)){
      const blob=await this.api('/git/blobs',{method:'POST',body:JSON.stringify({content,encoding:'utf-8'})});tree.push({path,mode:'100644',type:'blob',sha:blob.sha});
    }
    const created=await this.api('/git/trees',{method:'POST',body:JSON.stringify({base_tree:parent.tree.sha,tree})});
    const commit=await this.api('/git/commits',{method:'POST',body:JSON.stringify({message:'Обновить структуру документации',tree:created.sha,parents:[ref]})});
    await this.api('/git/refs/heads/'+encodeURIComponent(c.branch),{method:'PATCH',body:JSON.stringify({sha:commit.sha,force:false})});return commit.sha;
  }
  async api(path:string,init:RequestInit={}):Promise<any>{
    const c=this.config,url=c.provider==='github'?'https://api.github.com/repos/'+c.project+path:c.host.replace(/\/$/,'')+'/api/v4/projects/'+encodeURIComponent(c.project)+path;
    const response=await fetch(url,{...init,headers:{'Content-Type':'application/json',...(c.provider==='github'?{Authorization:'Bearer '+c.token,Accept:'application/vnd.github+json'}:{'PRIVATE-TOKEN':c.token}),...init.headers}});
    const raw=await response.text();let body:any=null;try{body=raw?JSON.parse(raw):null;}catch{}
    if(!response.ok){const detail=[body?.message,...(Array.isArray(body?.errors)?body.errors.map((e:any)=>typeof e==='string'?e:e.message||e.code):[])].filter(Boolean).join('; ');const error=new Error(response.status===401?'Токен публикации недействителен':response.status===403?'Нет прав на публикацию в выбранном репозитории':response.status===404?'Файл или репозиторий документации не найден':`Публикация остановлена (${response.status})${detail?`: ${detail}`:""}`);Object.assign(error,{status:response.status});throw error;}
    return body;
  }
  async file(path:string,ref=this.config.branch):Promise<RepoFile|null>{
    try{if(this.config.provider==='gitlab'){const f=await this.api('/repository/files/'+encodeURIComponent(path)+'?ref='+encodeURIComponent(ref));return {content:decodeText(f.content),sha:f.last_commit_id};}
      const f=await this.api('/contents/'+path+'?ref='+encodeURIComponent(ref));if(f.content)return {content:decodeText(f.content),sha:f.sha};
      const b=await this.api('/git/blobs/'+f.sha);return {content:decodeText(b.content),sha:f.sha};
    }catch(e){if((e as any).status===404)return null;throw e;}
  }
  async publish(draft:Draft,content:DocNode){
    const c=this.config;if(!c.token.trim())throw new Error('Укажите токен для публикации в настройках');
    if(!/^[\w.-]+(?:\/[\w.-]+)+$/.test(c.project))throw new Error('Укажите репозиторий документации');
    const head=c.provider==='github'?await this.api('/git/ref/heads/'+encodeURIComponent(c.branch)):await this.api('/repository/branches/'+encodeURIComponent(c.branch));
    const ref=c.provider==='github'?head.object.sha:head.commit.id;
    const english=draft.locale==='en';
    const overlayPath='src/content/editor-pages'+(english?'.en':'')+'.json';
    const docPath=(english?'i18n/en/docusaurus-plugin-content-docs/current/':'docs/')+draft.id+'.md';
    const otherOverlayPath='src/content/editor-pages'+(english?'':'.en')+'.json';
    const paths=['index.html','src/offline-template.html','src/components/navigation.json',overlayPath,otherOverlayPath,'src/components/EditedSection.jsx','src/components/carousel-runtime.js','scripts/export-html.py','sidebars.js',docPath];
    const loaded=await Promise.all(paths.map(p=>this.file(p,ref)));const files=new Map(paths.map((p,i)=>[p,loaded[i]]));
    const index=files.get('index.html');if(!index)throw new Error('В репозитории нет index.html вашей документации');
    const marker=/<script id="document-data" type="application\/json">([\s\S]*?)<\/script>/;
    const match=index.content.match(marker);if(!match)throw new Error('Этот репозиторий не содержит ожидаемую структуру документации');
    const data=withoutEditorMetadata(JSON.parse(match[1]));if(!data.pages?.[draft.id])throw new Error('Страница отсутствует в документации');
    const localePages=english?((data.translations??={}).en??={pages:{}}).pages:data.pages;
    const currentHtml=localePages[draft.id]?.html||'';
    if(await normalizePublishedImages(currentHtml)!==await normalizePublishedImages(draft.publishedHtml||draft.baseHtml))throw new Error('На сайте есть изменения, сделанные вне редактора. Публикация остановлена, чтобы сохранить их. Скачайте HTML с вашими правками и согласуйте обновление страницы.');
    const {doc,assets}=await preparePublishedDocument(normalizeHeadings(content));
    const html=renderDocument(doc),toc=headings(doc).map(({id,title,level})=>({id,title,level}));
    localePages[draft.id]={...data.pages[draft.id],title:draft.title,html,toc};
    if(!english)data.groups.forEach((g:any)=>g.items.forEach((p:any)=>{if(p.id===draft.id)p.title=draft.title;}));
    const writes:Record<string,string>={};
    writes['index.html']=installOfflineLinks(index.content.replace(marker,()=>'<script id="document-data" type="application/json">'+JSON.stringify(data).replace(/</g,'\\u003c')+'</script>'));
    const offlineTemplate=files.get('src/offline-template.html');
    if(offlineTemplate)writes['src/offline-template.html']=installOfflineLinks(offlineTemplate.content);
    if(!english)writes['src/components/navigation.json']=JSON.stringify(data.groups,null,2)+'\n';
    const overlay=withoutEditorMetadata(JSON.parse(files.get(overlayPath)?.content||'{}'));
    const otherOverlay=files.get(otherOverlayPath);
    if(otherOverlay){
      const original=JSON.parse(otherOverlay.content),clean=withoutEditorMetadata(original);
      if(JSON.stringify(original)!==JSON.stringify(clean))writes[otherOverlayPath]=JSON.stringify(clean,null,2)+'\n';
    }
    const inner=html.replace(/^<div class="imported-api">/,'').replace(/<\/div>$/,'');
    const matches=[...inner.matchAll(/<h([2-6])\b[^>]*>[\s\S]*?<\/h\1>/g)];
    const segments=[inner.slice(0,matches[0]?.index??inner.length),...matches.map((m,i)=>inner.slice(m.index!+m[0].length,matches[i+1]?.index??inner.length))];
    overlay[draft.id]={title:draft.title,html,toc,segments,content:doc};
    writes[overlayPath]=JSON.stringify(overlay,null,2)+'\n';
    writes['src/components/EditedSection.jsx']=`import React from 'react';\nimport useBaseUrl from '@docusaurus/useBaseUrl';\nimport content from '../content/editor-pages.json';\nimport {handleCodeCopy} from './document-ui';\nexport default function EditedSection({page,index}) {\n const base=useBaseUrl('/');\n const html=(content[page]?.segments[index]||'').replace(/href="#\\/([^"@]+)(?:@([^"\\s]+))?"/g,(_,route,anchor)=>'href="'+base+route+'/'+(anchor?'#'+anchor:'')+'"');\n return <div className="imported-api" onClick={handleCodeCopy} dangerouslySetInnerHTML={{__html:html}}/>;\n}\n`;
    const existingDoc=files.get(docPath)?.content||'---\n---\n';
    let front=existingDoc.match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0]||'---\n---';
    front=front.replace(/^title:.*\n/m,'');front=front.replace(/^---\n/,'---\ntitle: '+JSON.stringify(draft.title)+'\n');
    const markdownEscape=(s:string)=>s.replace(/([\\`*{}\[\]<>])/g,'\\$1').replace(/\n/g,' ');
    writes[docPath]=front+'\n\nimport EditedSection from \'@site/src/components/EditedSection\';\n\n<EditedSection page="'+draft.id+'" index={0} />\n\n'+toc.map((h,i)=>'#'.repeat(h.level)+' '+markdownEscape(h.title)+' {#'+h.id+'}\n\n<EditedSection page="'+draft.id+'" index={'+(i+1)+'} />\n').join('\n');
    let exporter=files.get('scripts/export-html.py')?.content;
    if(!exporter)throw new Error('Не найден файл сборки документации');
    if(!exporter.includes('EDITOR_PAGES_FILE')){
      exporter=exporter.replace('pages = {}',`pages = {}\nEDITOR_PAGES_FILE = ROOT / 'src/content/editor-pages.json'\neditor_pages = json.loads(EDITOR_PAGES_FILE.read_text()) if EDITOR_PAGES_FILE.exists() else {}`);
      const point="        raw=(SOURCE/'docs'/(item['id']+'.md')).read_text()";
      if(!exporter.includes(point))throw new Error('Структура сборки изменилась. Нужна проверка совместимости.');
      exporter=exporter.replace(point,"        if item['id'] in editor_pages:\n            edited = editor_pages[item['id']]\n            pages[item['id']] = {**item, 'group': g['id'], 'title': edited['title'], 'html': edited['html'], 'toc': edited['toc']}\n            continue\n"+point);
    }
    writes['scripts/export-html.py']=exporter;
    let sidebar=files.get('sidebars.js')?.content;
    if(!sidebar)throw new Error('Не найдена навигация документации');
    if(!sidebar.includes('editorPagesPath')){
      const line='const apiHeadings = makeApiOutline(apiHeadingsFlat);';
      if(!sidebar.includes(line))throw new Error('Навигация изменилась. Нужна проверка совместимости.');
      sidebar=sidebar.replace(line,`const editorPagesPath = path.join(__dirname, 'src/content/editor-pages.json');\nconst editorPages = fs.existsSync(editorPagesPath) ? JSON.parse(fs.readFileSync(editorPagesPath,'utf8')) : {};\nconst apiHeadings = makeApiOutline(editorPages['tech/api'] ? editorPages['tech/api'].toc.map(h=>({...h,anchor:h.id})) : apiHeadingsFlat);`);
    }
    if(!english)writes['sidebars.js']=sidebar;
    // Preserve the site's render loader and interactions while adding image routing.
    const editedSection=files.get('src/components/EditedSection.jsx')?.content;
    if(editedSection){
      writes['src/components/EditedSection.jsx']=editedSection;
      if(!editedSection.includes("base+'img/editor/'")){
        const point="(content[page]?.segments[index]||'')";
        if(!editedSection.includes(point))throw new Error('Компонент документации изменился. Нужна проверка совместимости изображений.');
        writes['src/components/EditedSection.jsx']=editedSection.replace(point,point+`.replaceAll('src="static/img/editor/', 'src="'+base+'img/editor/')`);
      }
    }else{
      writes['src/components/EditedSection.jsx']=writes['src/components/EditedSection.jsx'].replace("(content[page]?.segments[index]||'')","(content[page]?.segments[index]||'').replaceAll('src=\"static/img/editor/', 'src=\"'+base+'img/editor/')");
    }
    writes['src/components/EditedSection.jsx']=installNativeLinks(writes['src/components/EditedSection.jsx']);
    writes['index.html']=installCarouselHtml(writes['index.html']);
    if(writes['src/offline-template.html'])writes['src/offline-template.html']=installCarouselHtml(writes['src/offline-template.html']);
    writes['src/components/EditedSection.jsx']=installCarouselComponent(writes['src/components/EditedSection.jsx']);
    writes['src/components/carousel-runtime.js']=carouselRuntimeSource;
    let sha:string;
    if(c.provider==='github'){
      const parent=await this.api('/git/commits/'+ref);
      const blobs=[];
      for(const asset of assets.values()){
        const blob=await this.api('/git/blobs',{method:'POST',body:JSON.stringify({content:asset.content,encoding:asset.encoding})});
        blobs.push({path:asset.path,mode:'100644',type:'blob',sha:blob.sha});
      }
      for(const [path,content] of Object.entries(writes)){
        const blob=await this.api('/git/blobs',{method:'POST',body:JSON.stringify({content,encoding:'utf-8'})});
        blobs.push({path,mode:'100644',type:'blob',sha:blob.sha});
      }
      const tree=await this.api('/git/trees',{method:'POST',body:JSON.stringify({base_tree:parent.tree.sha,tree:blobs})});
      const commit=await this.api('/git/commits',{method:'POST',body:JSON.stringify({message:'Обновить документацию: '+draft.title,tree:tree.sha,parents:[ref]})});
      await this.api('/git/refs/heads/'+encodeURIComponent(c.branch),{method:'PATCH',body:JSON.stringify({sha:commit.sha,force:false})});sha=commit.sha;
    }else{
      const imageActions=[];
      for(const asset of assets.values()){
        const existing=await this.file(asset.path,ref);
        if(!existing)imageActions.push({action:'create',file_path:asset.path,content:asset.content,encoding:asset.encoding});
      }
      const result=await this.api('/repository/commits',{method:'POST',body:JSON.stringify({branch:c.branch,commit_message:'Обновить документацию: '+draft.title,actions:[...imageActions,...Object.entries(writes).map(([file_path,content])=>({action:files.get(file_path)?'update':'create',file_path,content,...(files.get(file_path)?{last_commit_id:files.get(file_path)!.sha}:{})}))]})});sha=result.id;
    }
    return {sha,html};
  }
}
