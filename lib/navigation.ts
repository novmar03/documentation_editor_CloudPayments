import seed from './seed.json';
import groups from './navigation.json';
import additions from './structure-pages.json';
export type NavigationPage={id:string;title:string;parentId?:string};
export const navigation=groups;
const source:Record<string,any>={...seed.pages,...additions};
export const pages:Record<string,any>=Object.fromEntries(navigation.flatMap(group=>group.items.map(item=>[item.id,{...source[item.id],...item,group:group.id}])));
