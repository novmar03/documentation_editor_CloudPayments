import type {DocNode} from './document';

export type ImageAsset = {path:string; content:string; encoding:'base64'};
const dataImage = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/;

/** Content-derived names deduplicate uploads without deleting older assets. */
export async function imageAsset(src:string):Promise<ImageAsset|null> {
  const match=src.match(dataImage);
  if(!match)return null;
  const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  return {path:'static/img/editor/'+hash+'.'+(match[1]==='jpeg'?'jpg':match[1]),content:match[2],encoding:'base64'};
}

export async function preparePublishedDocument(source:DocNode) {
  const doc=structuredClone(source),assets=new Map<string,ImageAsset>();
  const visit=async(node:DocNode):Promise<void>=>{
    if(node.type==='image'){
      const src=String(node.attrs?.src||'');
      if(!src&&node.attrs?.assetPath)throw new Error('Изображение не загружено. Откройте черновик заново перед публикацией.');
      const asset=await imageAsset(src);
      if(asset){assets.set(asset.path,asset);node.attrs!.src=asset.path;}
    }
    for(const child of node.content||[])await visit(child);
  };
  await visit(doc);
  return {doc,assets};
}

/** Migration changes image locations, not the page revision being edited. */
export async function normalizePublishedImages(html:string) {
  const images=[...new Set(html.match(/data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+/g)||[])];
  for(const src of images){const asset=await imageAsset(src);if(asset)html=html.split(src).join(asset.path);}
  return html;
}
