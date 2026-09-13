export type PageGroup={id:string;title:string;items:{id:string;title:string}[];[key:string]:any};
export type PageChange={type:'create';id:string;title:string;group:string}|{type:'delete';id:string}|{type:'move';id:string;direction:number};
export function applyPageChanges(input:any,changes:PageChange[]){
  const data=structuredClone(input);
  for(const op of changes){
    if(!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(op.id)||op.id==='index')throw new Error('Некорректный адрес страницы');
    const group=data.groups.find((g:PageGroup)=>g.items.some(p=>p.id===op.id));
    if(op.type==='create'){
      if(data.pages[op.id]||input.pages[op.id])throw new Error('Этот адрес уже занят или отмечен для удаления. Выберите другой.');
      const target=data.groups.find((g:PageGroup)=>g.id===op.group);
      if(!target||!op.title.trim())throw new Error('Выберите раздел и название страницы');
      target.items.push({id:op.id,title:op.title.trim()});
      data.pages[op.id]={id:op.id,title:op.title.trim(),group:target.id,html:'<div class="imported-api"><p><br></p></div>',toc:[]};
    }else{
      if(!group)throw new Error('Страница больше не существует. Обновите список.');
      const i=group.items.findIndex((p:any)=>p.id===op.id);
      if(op.type==='delete'){
        if(Object.keys(data.pages).length<=1)throw new Error('Нельзя удалить последнюю страницу');
        group.items.splice(i,1);delete data.pages[op.id];
      }else{
        const j=i+(op.direction<0?-1:1);
        if(j>=0&&j<group.items.length)[group.items[i],group.items[j]]=[group.items[j],group.items[i]];
      }
    }
  }
  return data;
}
export const structureKey=(groups:PageGroup[])=>JSON.stringify(groups.map(g=>({id:g.id,items:g.items.map(p=>({id:p.id,title:p.title}))})));
// Preserve special navigation categories while applying the explicit page order.
export function sidebarSource(){return `const fs=require('node:fs');const path=require('node:path');
const navigation=require('./src/components/navigation.json');
const editorPagesPath=path.join(__dirname,'src/content/editor-pages.json');
const editorPages=fs.existsSync(editorPagesPath)?JSON.parse(fs.readFileSync(editorPagesPath,'utf8')):{};
function apiOutline(){
 const file=path.join(__dirname,'docs/tech/api.md');
 const used=new Map();
 const headings=editorPages['tech/api']?.toc||[...(fs.existsSync(file)?fs.readFileSync(file,'utf8'):'').matchAll(/^(#{2,6}) (.+)$/gm)].map(([,h,t])=>{const slug=t.toLowerCase().replace(/[^\\p{L}\\p{N}_\\s-]/gu,'').replace(/ /g,'-');const n=used.get(slug)||0;used.set(slug,n+1);return {level:h.length,title:t,id:slug+(n?'-'+n:'')};});
 const root=[],stack=[{level:1,items:root}];
 headings.forEach((h,i)=>{while(stack.length>1&&stack.at(-1).level>=h.level)stack.pop();const link={type:'link',label:h.title,href:'/tech/api/#'+encodeURIComponent(h.id),autoAddBaseUrl:true};if(headings[i+1]?.level>h.level){const category={type:'category',label:h.title,collapsed:true,items:[]};stack.at(-1).items.push(category);stack.push({level:h.level,items:category.items});}else stack.at(-1).items.push(link);});return root;
}
module.exports={docs:['index',...navigation.filter(g=>g.items.length).map(g=>({type:'category',label:g.title,collapsed:true,items:g.items.map(p=>p.id==='tech/api'?{type:'category',label:p.title,link:{type:'doc',id:p.id},collapsed:true,items:apiOutline()}:p.id)}))]};
`;}
