import {withoutLegacyFields} from './draft-data';
/** Remove editor-only fields at the publication boundary, without changing the source. */
export function withoutEditorMetadata<T>(source:T):T {
  const copy=withoutLegacyFields(source);
  const visit=(value:any)=>{
    if(!value||typeof value!=='object')return;
    if(value.type==='image'&&value.attrs)delete value.attrs.assetPath;
    Object.values(value).forEach(visit);
  };
  visit(copy);
  return copy;
}
