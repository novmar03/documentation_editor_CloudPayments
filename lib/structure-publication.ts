import {validateNavigation,type NavigationGroup} from './structure';

export const readerNavigation=String.raw`function visibleNavigation(groups,audience='all'){
 return groups.filter(g=>!g.hidden).map(g=>{
  const byId=new Map(g.items.map(p=>[p.id,p]));
  function hidden(p){return !!p.hidden||!!(p.parentId&&byId.has(p.parentId)&&hidden(byId.get(p.parentId)));}
  const items=g.items.filter(p=>!hidden(p)&&(audience==='all'||(p.audience||g.audience)==='both'||(p.audience||g.audience)===audience));
  const ids=new Set(items.map(p=>p.id));
  const promoted=items.map(p=>{let parentId=p.parentId;while(parentId&&!ids.has(parentId))parentId=byId.get(parentId)?.parentId;return {...p,parentId};});
  const hasPage=p=>p.type!=='category'||promoted.some(child=>child.parentId===p.id&&hasPage(child));
  return {...g,items:promoted.filter(hasPage),links:(g.links||[]).filter(p=>ids.has(p.id))};
 }).filter(g=>g.items.length);
}`;

function replaceRequired(source:string,from:string,to:string){if(!source.includes(from))throw new Error('Структура сайта изменилась. Публикация остановлена для проверки совместимости.');return source.replace(from,to);}

export function installStructureReader(source:string){
  if(source.includes('/* EDITOR_STRUCTURE_V1 */'))return source;
  source=replaceRequired(source,'function sidebarPage(p,id){','/* EDITOR_STRUCTURE_V1 */\n'+readerNavigation+'\nfunction sidebarPage(p,id){');
  source=replaceRequired(source,"const link='<a '","const link=p.type==='category'?'<span>'+escapeHtml(p.title)+'</span>':'<a '");
  source=replaceRequired(source,'groups.flatMap(g=>g.items).filter(child=>child.parentId===p.id)','visibleNavigation(groups).flatMap(g=>g.items).filter(child=>child.parentId===p.id)');
  source=source.replace("if(p.id!=='tech/api')return link;","if(p.type==='category'||p.id!=='tech/api')return link;");
  source=replaceRequired(source,"groups.map(g=>'<details '","visibleNavigation(groups).map(g=>g.root?g.items.filter(p=>!p.parentId).map(p=>sidebarPage(p,id)).join(''):'<details '");
  source=replaceRequired(source,'const shown=visibleGroups();','const shown=visibleNavigation(groups,audience);');
  source=replaceRequired(source,"[...g.items.filter(p=>!p.parentId),...(g.links||[])].map(p=>'<li><a href=\"'+routeUrl(p.id,p.anchor||'')+'\"><span>'+escapeHtml(p.title)+'</span><span class=\"chevron\">›</span></a></li>').join('')","overviewItems(g.items,undefined)+(g.links||[]).map(p=>'<li><a href=\"'+routeUrl(p.id,p.anchor||'')+'\">'+escapeHtml(p.title)+'</a></li>').join('')");
  source=source.replace('function overview(){',String.raw`function overviewItems(items,parentId){return items.filter(p=>p.parentId===parentId).map(p=>'<li>'+(p.type==='category'?'<span>'+escapeHtml(p.title)+'</span>':'<a href="'+routeUrl(p.id)+'">'+escapeHtml(p.title)+'</a>')+(items.some(c=>c.parentId===p.id)?'<ul>'+overviewItems(items,p.id)+'</ul>':'')+'</li>').join('')}
function overview(){`);
  source=replaceRequired(source,"const g=groups.find(g=>g.id===p.group),items=groups.flatMap(g=>g.items)","const g=groups.find(g=>g.id===p.group)||{title:'',audience:p.audience||'both'},items=visibleNavigation(groups).flatMap(g=>g.items).filter(p=>p.type!=='category')");
  source=source.replace("(index<items.length-1?", "(index>=0&&index<items.length-1?");
  // Locale adapters must not invent pages for navigation-only categories.
  source=source.replace("for(const p of g.items){const en=translations[p.id];","for(const p of g.items){if(p.type==='category')continue;const en=translations[p.id];");
  return source;
}
export function installStructureSidebar(source:string){
  if(source.includes('/* EDITOR_STRUCTURE_V1 */'))return source;
  source=replaceRequired(source,'function sidebarItems(items,parentId){','/* EDITOR_STRUCTURE_V1 */\n'+readerNavigation+'\nfunction sidebarItems(items,parentId){');
  source=replaceRequired(source,"if(children.length)return {type:'category',label:p.title,link:{type:'doc',id:p.id},collapsed:true,items:sidebarItems(items,p.id)};","if(children.length||p.type==='category')return {type:'category',key:p.id,label:p.title,...(p.type==='category'?{}:{link:{type:'doc',id:p.id}}),collapsed:true,items:sidebarItems(items,p.id)};");
  source=source.replace(":p.id;",":{type:'doc',id:p.id,key:p.id,label:p.title};");
  source=source.replace("p.id==='tech/api'?{type:'category',label:p.title","p.id==='tech/api'?{type:'category',key:p.id,label:p.title");
  source=replaceRequired(source,"navigation.filter(g=>g.items.length).map(g=>({type:'category',label:g.title,collapsed:true,items:sidebarItems(g.items)}))","visibleNavigation(navigation).flatMap(g=>g.root?sidebarItems(g.items):[{type:'category',key:'section-'+g.id,label:g.title,collapsed:true,items:sidebarItems(g.items)}])");
  return source;
}
export function installStructureIndex(source:string){
  if(source.includes('/* EDITOR_STRUCTURE_V1 */'))return source;
  source='/* EDITOR_STRUCTURE_V1 */\n'+readerNavigation+'\n'+source;
  source=replaceRequired(source,"groups.filter(g=>audience==='all'||g.audience===audience||g.audience==='both')","visibleNavigation(groups,audience)");
  const from="{[...g.items.filter(item=>!item.parentId),...(g.links||[])].map(item=><li key={item.id+':'+item.title}><Link to={'/'+item.id+'/'+(item.anchor?'#'+item.anchor:'')}><span>{item.title}</span><span className=\"link-chevron\" aria-hidden=\"true\">›</span></Link></li>)}";
  const to="{renderNavigationItems(g.items)}{(g.links||[]).map(item=><li key={item.id+':'+item.title}><Link to={'/'+item.id+'/'+(item.anchor?'#'+item.anchor:'')}>{item.title}</Link></li>)}";
  source=replaceRequired(source,from,to);
  source+=`\nfunction renderNavigationItems(items,parentId){return items.filter(p=>p.parentId===parentId).map(p=><li key={p.id}>{p.type==='category'?<span>{p.title}</span>:<Link to={'/'+p.id+'/'}>{p.title}</Link>}{items.some(c=>c.parentId===p.id)&&<ul>{renderNavigationItems(items,p.id)}</ul>}</li>);}\n`;
  return source;
}
export function structureWrites(files:Record<string,string>,groups:NavigationGroup[],base:NavigationGroup[]){
  validateNavigation(groups);
  const current=JSON.parse(files['src/components/navigation.json']);
  if(JSON.stringify(current)!==JSON.stringify(base))throw new Error('Структура на сайте уже изменилась. Сохраните свои правки и загрузите актуальную структуру перед публикацией.');
  const marker=/<script id="document-data" type="application\/json">([\s\S]*?)<\/script>/;
  const match=files['index.html'].match(marker);if(!match)throw new Error('Не найдены данные документации');
  const data=JSON.parse(match[1]),writes:Record<string,string>={};
  const oldIds=new Set(current.flatMap((g:any)=>g.items.filter((p:any)=>p.type!=='category').map((p:any)=>p.id)));
  const nextIds=new Set(groups.flatMap(g=>g.items.filter(p=>p.type!=='category').map(p=>p.id)));
  for(const id of oldIds)if(!nextIds.has(id as string))throw new Error('Страницы нельзя удалять физически. Используйте «Убрать из навигации».');
  for(const g of groups)for(const p of g.items){
    if(p.type==='category')continue;
    if(!data.pages[p.id]){
      if(oldIds.has(p.id))throw new Error('Не найдены данные существующей страницы');
      data.pages[p.id]={id:p.id,title:p.title,html:'',toc:[],group:g.id};
      writes['docs/'+p.id+'.md']='---\ntitle: '+JSON.stringify(p.title)+'\nslug: /'+p.id+'/\n---\n';
      writes['i18n/en/docusaurus-plugin-content-docs/current/'+p.id+'.md']='---\ntitle: '+JSON.stringify(p.title)+'\nslug: /'+p.id+'/\n---\n\nimport EnglishUnavailable from \'@site/src/components/EnglishUnavailable\';\n\n<EnglishUnavailable page="'+p.id+'" />\n';
    }
    data.pages[p.id]={...data.pages[p.id],...p,group:g.id};
    // Translated titles and content are authored independently.
    if(data.translations?.en?.pages?.[p.id])data.translations.en.pages[p.id].group=g.id;
  }
  data.groups=groups;
  writes['src/components/navigation.json']=JSON.stringify(groups,null,2)+'\n';
  writes['index.html']=installStructureReader(files['index.html']).replace(marker,()=>'<script id="document-data" type="application/json">'+JSON.stringify(data).replace(/</g,'\\u003c')+'</script>');
  writes['src/offline-template.html']=installStructureReader(files['src/offline-template.html']);
  writes['sidebars.js']=installStructureSidebar(files['sidebars.js']);
  for(const path of ['src/components/DocumentationIndex.jsx','src/components/EnglishDocumentationIndex.jsx'])writes[path]=installStructureIndex(files[path]);
  writes['src/components/document-locales.cjs']=files['src/components/document-locales.cjs'].replace("for(const p of g.items){const en=translations[p.id];","for(const p of g.items){if(p.type==='category')continue;const en=translations[p.id];");
  let exporter=files['scripts/export-html.py'];
  if(!exporter.includes('# EDITOR_STRUCTURE_V1')){
    exporter=replaceRequired(exporter,"    for item in g['items']:","    for item in g['items']:\n        # EDITOR_STRUCTURE_V1\n        if item.get('type') == 'category': continue");
    exporter=exporter.replace("'title': edited['title']","'title': item['title']");
  }
  writes['scripts/export-html.py']=exporter;
  return writes;
}
export const structurePaths=['index.html','src/components/navigation.json','src/offline-template.html','sidebars.js','src/components/DocumentationIndex.jsx','src/components/EnglishDocumentationIndex.jsx','src/components/document-locales.cjs','scripts/export-html.py'];
