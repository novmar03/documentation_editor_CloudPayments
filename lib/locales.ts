export type Locale='ru'|'en';
export const draftKey=(id:string,locale:Locale='ru')=>locale==='en'?'en/'+id:id;
export function editorRoute(hash:string):{id:string;locale:Locale}{
  let route='';try{route=decodeURIComponent(hash.replace(/^#\/?/,''));}catch{}
  return route.startsWith('en/')?{id:route.slice(3),locale:'en'}:{id:route,locale:'ru'};
}
export const pageUrl=(base:string,id:string,locale:Locale='ru')=>base+'#/'+draftKey(id,locale);
