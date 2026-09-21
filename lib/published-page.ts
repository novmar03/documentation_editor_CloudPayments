import type {Publisher} from './publish';
import type {Draft} from './repository';
import type {DocNode} from './document';
import {ensureImageIds} from './image-notes';
import {DOCS_URL,DOCS_ROUTING} from './config';

export function editorImageUrls(source:DocNode){
  const doc=structuredClone(source);
  const visit=(node:DocNode)=>{
    if(node.type==='image'&&/^(?:static\/)?img\/editor\//.test(node.attrs?.src||'')){
      const path=node.attrs!.src;node.attrs!.src=new URL(DOCS_ROUTING==='path'?path.replace(/^static\//,''):path,DOCS_URL).href;
    }
    node.content?.forEach(visit);
  };visit(doc);return doc;
}
/** Read a pinned GitHub revision, not a possibly stale Pages response or bundled snapshot. */
export async function loadPublishedPage(pub:Publisher,id:string,locale:'ru'|'en',parse:(html:string)=>DocNode):Promise<Draft>{
  const ref=(await pub.api('/git/ref/heads/'+encodeURIComponent(pub.config.branch))).object.sha;
  const [index,overlay]=await Promise.all([pub.file('index.html',ref),pub.file('src/content/editor-pages'+(locale==='en'?'.en':'')+'.json',ref)]);
  const match=index?.content.match(/<script id="document-data" type="application\/json">([\s\S]*?)<\/script>/);
  if(!match)throw new Error('Не удалось загрузить опубликованную страницу');
  const data=JSON.parse(match[1]),page=(locale==='en'?data.translations?.en?.pages:data.pages)?.[id];
  if(!page)throw new Error('Для этой страницы ещё нет опубликованной версии на выбранном языке');
  const saved=overlay?JSON.parse(overlay.content)[id]:null;
  const content=await ensureImageIds(saved?.content&&saved.html===page.html?saved.content:parse(page.html));
  return {id,locale,title:page.title,content:editorImageUrls(content),baseHtml:page.html,publishedHtml:page.html,updated:new Date().toISOString()};
}
