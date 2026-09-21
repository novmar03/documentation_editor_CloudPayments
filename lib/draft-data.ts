import type {Draft} from './repository';
const imageAttributes=new Set(['src','alt','title','width','height','imageId','caption','assetPath','align']);
/** Read image data using the supported schema, without changing the source. */
export function withSupportedImageAttributes<T>(source:T):T {
  const copy=structuredClone(source);
  const visit=(value:any)=>{
    if(!value||typeof value!=='object')return;
    if(value.type==='image'&&value.attrs&&typeof value.attrs==='object'){
      value.attrs=Object.fromEntries(Object.entries(value.attrs).filter(([key])=>imageAttributes.has(key)));
    }
    Object.values(value).forEach(visit);
  };
  visit(copy);
  return copy;
}
export function readDraft(source:Draft):Draft {
  const {id,locale,title,updated,baseHtml,publishedHtml,commit}=source;
  const content=withSupportedImageAttributes(source.content);
  return {id,locale,title,updated,baseHtml,publishedHtml,commit,content};
}
