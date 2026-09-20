import {headings,type DocNode} from './document';
import {draftKey,type Locale} from './locales';
export type Section={id:string;title:string;level:number};
export type LinkPage={id:string;title:string;toc?:Section[];content?:DocNode};
export type DocumentationData={pages:Record<string,LinkPage>;translations?:{en?:{pages?:Record<string,LinkPage>}}};
export const documentationHref=(id:string,locale:Locale,anchor='')=>'/'+draftKey(id,locale)+'/'+(anchor?'#'+encodeURIComponent(anchor):'');
export function parseDocumentationHref(href:string,ids:Iterable<string>){
  const known=new Set(ids);
  let value=href,anchor='';
  if(value.startsWith('#/')){const at=value.indexOf('@');if(at>=0){anchor=value.slice(at+1);value=value.slice(0,at);}value=value.slice(1);}
  else {if(!value.startsWith('/')||value.startsWith('//'))return null;const at=value.indexOf('#');if(at>=0){anchor=value.slice(at+1);value=value.slice(0,at);}}
  value=value.replace(/^\/+|\/+$/g,'');
  const locale:Locale=value.startsWith('en/')?'en':'ru';
  const id=locale==='en'?value.slice(3):value;
  if(!known.has(id))return null;
  try{return {id,locale,anchor:decodeURIComponent(anchor)};}catch{return null;}
}
export function pageSections(page?:LinkPage):Section[]{
  return (page?.content?headings(page.content):page?.toc||[]).filter(h=>h.id&&h.level>=2&&h.level<=6);
}
export function localePages(data:DocumentationData,locale:Locale){return locale==='en'?data.translations?.en?.pages||{}:data.pages;}
export function publicHeadingUrl(base:string,id:string,locale:Locale,anchor:string,routing:'path'|'hash'='hash'){
  const root=base.replace(/\/+$/,'')+'/';
  return routing==='path'?root+documentationHref(id,locale,anchor).slice(1):root+'#/'+draftKey(id,locale)+(anchor?'@'+encodeURIComponent(anchor):'');
}
// Reuse the standalone reader's existing hash routes for canonical links.
// Only known documentation pages are rewritten; external and other root URLs stay intact.
export const offlineLinksScript=`<script id="editor-documentation-links">
(function(){
 function update(){
  var data=document.getElementById('document-data');if(!data)return;
  var pages;try{pages=JSON.parse(data.textContent).pages;}catch(e){return;}
  document.querySelectorAll('a[href^="/"]').forEach(function(a){
   var href=a.getAttribute('href');if(href.startsWith('//'))return;
   var parts=href.split('#'),route=parts[0].replace(/^\\/+|\\/+$/g,''),id=route.replace(/^en\\//,'');
   if(!pages[id])return;
   a.setAttribute('href','#/'+route+(parts[1]?'@'+parts.slice(1).join('#'):''));
  });
 }
 update();new MutationObserver(update).observe(document.body,{childList:true,subtree:true});
})();
</script>`;
export function installOfflineLinks(html:string){return html.includes('id="editor-documentation-links"')?html:html.replace('</body>',offlineLinksScript+'\n</body>');}
export function installNativeLinks(source:string){
  if(source.includes('const documentationLinkedHtml='))return source;
  if(!source.includes('__html:html'))throw new Error('Не удалось добавить внутренние ссылки в компонент документации');
  const point=' return <div';
  if(!source.includes(point))throw new Error('Изменилась структура компонента документации');
  const code=` const documentationRoutes=new Set(linkNavigation.flatMap(g=>g.items.map(p=>p.id)));
 const documentationLinkedHtml=html.replace(/href="\\/(?!\\/)([^"#]+)(#[^"]*)?"/g,(all,route,hash)=>documentationRoutes.has(route.replace(/^en\\//,'').replace(/\\/$/,''))?'href="'+base.replace(/\\/en\\/$/,'/')+route+(hash||'')+'"':all);
`;
  return "import linkNavigation from './navigation.json';\n"+source.replace(point,code+point).replace('__html:html','__html:documentationLinkedHtml');
}
