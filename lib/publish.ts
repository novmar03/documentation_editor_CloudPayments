import {DocNode,renderDocument,headings,normalizeHeadings} from './document';
import {Draft,decodeText} from './repository';
export type PublishConfig={provider:'github'|'gitlab';project:string;branch:string;host:string;token:string};
type RepoFile={content:string;sha:string};
export class Publisher {
  constructor(public config:PublishConfig){}
  async api(path:string,init:RequestInit={}):Promise<any>{
    const c=this.config,url=c.provider==='github'?'https://api.github.com/repos/'+c.project+path:c.host.replace(/\/$/,'')+'/api/v4/projects/'+encodeURIComponent(c.project)+path;
    const response=await fetch(url,{...init,headers:{'Content-Type':'application/json',...(c.provider==='github'?{Authorization:'Bearer '+c.token,Accept:'application/vnd.github+json'}:{'PRIVATE-TOKEN':c.token}),...init.headers}});
    if(!response.ok){const error=new Error(response.status===401?'Токен публикации недействителен':response.status===403?'Нет прав на публикацию в выбранном репозитории':response.status===404?'Файл или репозиторий документации не найден':`Публикация остановлена (${response.status}). Возможно, файлы изменились. Обновите данные перед повторной попыткой.`);Object.assign(error,{status:response.status});throw error;}
    return response.json();
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
    const paths=['index.html','src/components/navigation.json','src/content/editor-pages.json','src/components/EditedSection.jsx','scripts/export-html.py','sidebars.js','docs/'+draft.id+'.md'];
    const loaded=await Promise.all(paths.map(p=>this.file(p,ref)));const files=new Map(paths.map((p,i)=>[p,loaded[i]]));
    const index=files.get('index.html');if(!index)throw new Error('В репозитории нет index.html вашей документации');
    const marker=/<script id="document-data" type="application\/json">([\s\S]*?)<\/script>/;
    const match=index.content.match(marker);if(!match)throw new Error('Этот репозиторий не содержит ожидаемую структуру документации');
    const data=JSON.parse(match[1]);if(!data.pages?.[draft.id])throw new Error('Страница отсутствует в документации');
    const currentHtml=data.pages[draft.id].html;
    if(currentHtml!==(draft.publishedHtml||draft.baseHtml))throw new Error('На сайте есть изменения, сделанные вне редактора. Публикация остановлена, чтобы сохранить их. Скачайте HTML с вашими правками и согласуйте обновление страницы.');
    const doc=normalizeHeadings(content),html=renderDocument(doc),toc=headings(doc).map(({id,title,level})=>({id,title,level}));
    data.pages[draft.id]={...data.pages[draft.id],title:draft.title,html,toc};
    data.groups.forEach((g:any)=>g.items.forEach((p:any)=>{if(p.id===draft.id)p.title=draft.title;}));
    const writes:Record<string,string>={};
    writes['index.html']=index.content.replace(marker,()=>'<script id="document-data" type="application/json">'+JSON.stringify(data).replace(/</g,'\\u003c')+'</script>');
    writes['src/components/navigation.json']=JSON.stringify(data.groups,null,2)+'\n';
    const overlay=JSON.parse(files.get('src/content/editor-pages.json')?.content||'{}');
    const inner=html.replace(/^<div class="imported-api">/,'').replace(/<\/div>$/,'');
    const matches=[...inner.matchAll(/<h([2-6])\b[^>]*>[\s\S]*?<\/h\1>/g)];
    const segments=[inner.slice(0,matches[0]?.index??inner.length),...matches.map((m,i)=>inner.slice(m.index!+m[0].length,matches[i+1]?.index??inner.length))];
    overlay[draft.id]={title:draft.title,html,toc,segments,content:doc};
    writes['src/content/editor-pages.json']=JSON.stringify(overlay,null,2)+'\n';
    writes['src/components/EditedSection.jsx']=`import React from 'react';\nimport useBaseUrl from '@docusaurus/useBaseUrl';\nimport content from '../content/editor-pages.json';\nimport {handleCodeCopy} from './document-ui';\nexport default function EditedSection({page,index}) {\n const base=useBaseUrl('/');\n const html=(content[page]?.segments[index]||'').replace(/href="#\\/([^"@]+)(?:@([^"\\s]+))?"/g,(_,route,anchor)=>'href="'+base+route+'/'+(anchor?'#'+anchor:'')+'"');\n return <div className="imported-api" onClick={handleCodeCopy} dangerouslySetInnerHTML={{__html:html}}/>;\n}\n`;
    const existingDoc=files.get('docs/'+draft.id+'.md')?.content||'---\n---\n';
    let front=existingDoc.match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0]||'---\n---';
    front=front.replace(/^title:.*\n/m,'');front=front.replace(/^---\n/,'---\ntitle: '+JSON.stringify(draft.title)+'\n');
    const markdownEscape=(s:string)=>s.replace(/([\\`*{}\[\]<>])/g,'\\$1').replace(/\n/g,' ');
    writes['docs/'+draft.id+'.md']=front+'\n\nimport EditedSection from \'@site/src/components/EditedSection\';\n\n<EditedSection page="'+draft.id+'" index={0} />\n\n'+toc.map((h,i)=>'#'.repeat(h.level)+' '+markdownEscape(h.title)+' {#'+h.id+'}\n\n<EditedSection page="'+draft.id+'" index={'+(i+1)+'} />\n').join('\n');
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
    writes['sidebars.js']=sidebar;
    let sha:string;
    if(c.provider==='github'){
      const parent=await this.api('/git/commits/'+ref);
      const tree=await this.api('/git/trees',{method:'POST',body:JSON.stringify({base_tree:parent.tree.sha,tree:Object.entries(writes).map(([path,content])=>({path,mode:'100644',type:'blob',content}))})});
      const commit=await this.api('/git/commits',{method:'POST',body:JSON.stringify({message:'Обновить документацию: '+draft.title,tree:tree.sha,parents:[ref]})});
      await this.api('/git/refs/heads/'+encodeURIComponent(c.branch),{method:'PATCH',body:JSON.stringify({sha:commit.sha,force:false})});sha=commit.sha;
    }else{
      const result=await this.api('/repository/commits',{method:'POST',body:JSON.stringify({branch:c.branch,commit_message:'Обновить документацию: '+draft.title,actions:Object.entries(writes).map(([file_path,content])=>({action:files.get(file_path)?'update':'create',file_path,content,...(files.get(file_path)?{last_commit_id:files.get(file_path)!.sha}:{})}))})});sha=result.id;
    }
    return {sha,html};
  }
}
