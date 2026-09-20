import seed from './seed.json';
import groups from './navigation.json';
import additions from './structure-pages.json';
import type {NavigationGroup,NavigationNode} from './structure';
export type NavigationPage=NavigationNode;
export const navigation:NavigationGroup[]=groups as NavigationGroup[];
const source:Record<string,any>={...seed.pages,...additions};
export const pages:Record<string,any>=Object.fromEntries(navigation.flatMap(group=>group.items.map(item=>[item.id,{...source[item.id],...item,group:group.id}])));
export function applyNavigation(next:NavigationGroup[],published?:Record<string,any>){
  navigation.splice(0,navigation.length,...next);
  for(const group of next)for(const item of group.items){
    if(item.type==='category')continue;
    const remote=published?.[item.id];
    pages[item.id]={...pages[item.id],...(remote?{...remote,editorHtml:remote.html,originalHtml:remote.html}:{}),...item,group:group.id};
    pages[item.id].editorHtml??='<p></p>';pages[item.id].originalHtml??='';
  }
}
