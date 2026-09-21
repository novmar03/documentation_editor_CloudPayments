import type {Draft} from './repository';
/** Ignore retired fields in older drafts and publication snapshots. */
export function withoutLegacyFields<T>(source:T):T {
  const copy=structuredClone(source);
  const visit=(value:any)=>{
    if(!value||typeof value!=='object')return;
    delete value.scriptNote;
    Object.values(value).forEach(visit);
  };
  visit(copy);
  return copy;
}
export function readDraft(source:Draft):Draft {
  const {id,locale,title,updated,baseHtml,publishedHtml,commit}=source;
  const content=withoutLegacyFields(source.content);
  return {id,locale,title,updated,baseHtml,publishedHtml,commit,content};
}
