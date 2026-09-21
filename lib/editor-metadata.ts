/** Remove editor-only fields at the publication boundary, without changing drafts. */
export function withoutEditorMetadata<T>(source:T):T {
  const copy=structuredClone(source);
  const visit=(value:any)=>{
    if(!value||typeof value!=='object')return;
    delete value.scriptNote;
    if(value.type==='image'&&value.attrs)delete value.attrs.assetPath;
    Object.values(value).forEach(visit);
  };
  visit(copy);
  return copy;
}
