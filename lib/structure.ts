export type Audience = 'business' | 'developer' | 'both';
export type NavigationNode = {id:string;title:string;type?:'page'|'category';parentId?:string;audience?:Audience;hidden?:boolean};
export type NavigationGroup = {id:string;title:string;audience:Audience;description?:string;root?:boolean;hidden?:boolean;items:NavigationNode[];links?:{id:string;title:string;anchor?:string}[]};
export type StructureNode = NavigationNode & {key:string;parent?:string;audience:Audience;group?:Omit<NavigationGroup,'items'>};

export const documentationSettingsPath='src/content/documentation-settings.json';
export type DocumentationSettings={showOverviewPage:boolean};
export type StructureDraft={groups:NavigationGroup[];base:NavigationGroup[];settings:DocumentationSettings;baseSettings:DocumentationSettings};
export function documentationSettings(value?:Partial<DocumentationSettings>|null):DocumentationSettings{return {showOverviewPage:value?.showOverviewPage!==false};}
export function createStructureDraft(groups:NavigationGroup[],settings?:Partial<DocumentationSettings>):StructureDraft{
  return {groups:structuredClone(groups),base:structuredClone(groups),settings:documentationSettings(settings),baseSettings:documentationSettings(settings)};
}
export function recoverStructureDraft(saved:Partial<StructureDraft>|null,published:StructureDraft):StructureDraft{
  if(!saved)return published;
  validateNavigation(saved.groups!);validateNavigation(saved.base!);
  return {...published,...saved,settings:documentationSettings(saved.settings??published.settings),baseSettings:documentationSettings(saved.baseSettings??published.baseSettings)};
}
export function structureDirty(draft:StructureDraft){return JSON.stringify(draft.groups)!==JSON.stringify(draft.base)||draft.settings.showOverviewPage!==draft.baseSettings.showOverviewPage;}

// The flat tree is a view of navigation.json, never a second persisted model.
export function structureNodes(groups:NavigationGroup[]):StructureNode[]{
  return groups.flatMap(g=>[
    ...(!g.root?[{id:g.id,key:'section:'+g.id,title:g.title,type:'category' as const,audience:g.audience,hidden:g.hidden,group:{...g,items:undefined} as any}]:[]),
    ...g.items.map(p=>({...p,key:p.id,parent:p.parentId||(!g.root?'section:'+g.id:undefined),audience:p.audience||g.audience}))
  ]);
}
export function navigationGroups(nodes:StructureNode[]):NavigationGroup[]{
  const descendants=(parent:string):StructureNode[]=>nodes.filter(n=>n.parent===parent).flatMap(n=>[n,...descendants(n.key)]);
  return nodes.filter(n=>!n.parent).map(root=>{
    const category=root.type==='category';
    const items=(category?descendants(root.key):[root,...descendants(root.key)]).map(n=>({id:n.key.startsWith('section:')?'category/'+n.id:n.id,title:n.title,type:n.type||'page',audience:n.audience,hidden:n.hidden,...(n.parent&&n.parent!==root.key?{parentId:n.parent.startsWith('section:')?'category/'+n.parent.slice(8):n.parent}:!category&&n.parent===root.key?{parentId:root.id}:{})}));
    return {...root.group,id:category?root.id:'root-'+root.id,title:root.title,audience:root.audience,description:root.group?.description||'',root:!category,hidden:root.hidden,items};
  });
}
export function validateNavigation(groups:NavigationGroup[]){
  const nodes=structureNodes(groups),keys=new Set<string>(),pageIds=new Set<string>();
  for(const node of nodes){
    if(keys.has(node.key)||!node.title.trim())throw new Error('Названия и идентификаторы узлов должны быть корректными и уникальными');
    keys.add(node.key);
    if(!['business','developer','both'].includes(node.audience))throw new Error('Выберите аудиторию');
    if(node.type!=='category'){
      if(!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(node.id)||['index','en'].includes(node.id)||node.id.startsWith('en/'))throw new Error('Адрес страницы должен содержать латинские буквы, цифры, дефис или подчёркивание');
      if(pageIds.has(node.id))throw new Error('Страница с таким адресом уже существует');pageIds.add(node.id);
    }
  }
  for(const node of nodes){const visited=new Set([node.key]);let parent=node.parent;while(parent){if(visited.has(parent))throw new Error('Нельзя переместить раздел внутрь самого себя');visited.add(parent);const found=nodes.find(n=>n.key===parent);if(!found)throw new Error('Родительский раздел не найден');parent=found.parent;}}
}
export function moveNode(groups:NavigationGroup[],key:string,parent?:string,before?:string):NavigationGroup[]{
  const nodes=structureNodes(groups),node=nodes.find(n=>n.key===key);
  if(!node)throw new Error('Узел не найден');
  const moved={...node,parent};const next=nodes.filter(n=>n.key!==key);const index=before?next.findIndex(n=>n.key===before):-1;next.splice(index<0?next.length:index,0,moved);
  // Validate before serialization, which recursively follows parent relationships.
  let ancestor=parent;const visited=new Set([key]);while(ancestor){if(visited.has(ancestor))throw new Error('Нельзя переместить раздел внутрь самого себя');visited.add(ancestor);const p=next.find(n=>n.key===ancestor);if(!p)throw new Error('Раздел назначения не найден');ancestor=p.parent;}
  const result=navigationGroups(next);validateNavigation(result);return result;
}
export function updateNode(groups:NavigationGroup[],key:string,patch:Partial<Pick<StructureNode,'title'|'audience'|'hidden'>>){
  const nodes=structureNodes(groups);
  const descendant=(node:StructureNode):boolean=>node.parent===key||!!(node.parent&&descendant(nodes.find(n=>n.key===node.parent)!));
  return navigationGroups(nodes.map(n=>n.key===key?{...n,...patch}:patch.audience&&descendant(n)?{...n,audience:patch.audience}:n));
}
export function visibleTree(groups:NavigationGroup[],audience?:Audience){
  const nodes=structureNodes(groups),hidden=(n:StructureNode):boolean=>!!n.hidden||!!(n.parent&&hidden(nodes.find(p=>p.key===n.parent)!));
  const shown=nodes.filter(n=>!hidden(n)&&(!audience||audience==='both'||n.audience==='both'||n.audience===audience));
  // A differently targeted parent does not hide a child: promote it in this view.
  const keys=new Set(shown.map(n=>n.key));return shown.map(n=>{let parent=n.parent;while(parent&&!keys.has(parent))parent=nodes.find(n=>n.key===parent)?.parent;return {...n,parent};});
}
