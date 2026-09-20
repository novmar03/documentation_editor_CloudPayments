import {useEffect,useState} from 'react';
import {toast} from 'sonner';
import {GripVertical,MoreHorizontal,Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from '@/components/ui/dropdown-menu';
import {navigation,applyNavigation} from '@/lib/navigation';
import {structureNodes,navigationGroups,moveNode,updateNode,visibleTree,validateNavigation,type NavigationGroup,type StructureNode,type Audience} from '@/lib/structure';
import {Publisher} from '@/lib/publish';
import {DOCS_URL,DOCS_REPO} from '@/lib/config';
import type {Repository} from '@/lib/repository';

const storageKey='cloudpayments-documentation-structure-v1';
const audienceLabels={business:'Для бизнеса',developer:'Для разработчиков',both:'Для бизнеса и разработчиков'};
type StructureDraft={groups:NavigationGroup[];base:NavigationGroup[]};
export function StructureManager({repository,onOpen,onConnect,onChange,onClose}:{repository:Repository|null;onOpen:(id:string)=>void;onConnect:()=>void;onChange:()=>void;onClose:()=>void}){
  const [draft,setDraft]=useState<StructureDraft>(()=>({groups:structuredClone(navigation),base:structuredClone(navigation)}));
  const [ready,setReady]=useState(false),[loadError,setLoadError]=useState(false),[reload,setReload]=useState(0),[busy,setBusy]=useState(false),[drag,setDrag]=useState<string|null>(null),[drop,setDrop]=useState('');
  const [dialog,setDialog]=useState<{action:string;key?:string}|null>(null),[title,setTitle]=useState(''),[route,setRoute]=useState(''),[parent,setParent]=useState(''),[audience,setAudience]=useState<Audience>('both');
  const nodes=structureNodes(draft.groups),selected=nodes.find(n=>n.key===dialog?.key),dirty=JSON.stringify(draft.groups)!==JSON.stringify(draft.base);
  const publisher=()=>new Publisher({provider:'github',project:DOCS_REPO,branch:'main',host:'https://github.com',token:repository?.config.token||''});
  useEffect(()=>{let cancelled=false;setReady(false);setLoadError(false);void(async()=>{
    try{
      const saved=localStorage.getItem(storageKey);
      const recovered=saved?JSON.parse(saved):null;if(recovered){validateNavigation(recovered.groups);validateNavigation(recovered.base);}
      let html:string;
      if(repository){const file=await publisher().file('index.html');if(!file)throw new Error();html=file.content;}
      else{const response=await fetch(DOCS_URL,{cache:'no-store'});if(!response.ok)throw new Error();html=await response.text();}
      const match=html.match(/<script id="document-data" type="application\/json">([\s\S]*?)<\/script>/);if(!match)throw new Error();
      const data=JSON.parse(match[1]);validateNavigation(data.groups);if(cancelled)return;
      const next=recovered||{groups:data.groups,base:structuredClone(data.groups)};setDraft(next);applyNavigation(next.groups,data.pages);onChange();setReady(true);
    }catch{if(!cancelled){setLoadError(true);onChange();toast.error('Не удалось загрузить структуру. Проверьте соединение и нажмите «Загрузить с сайта».');}}
  })();return()=>{cancelled=true;};},[reload,repository]);
  function change(groups:NavigationGroup[]){validateNavigation(groups);const next={...draft,groups};localStorage.setItem(storageKey,JSON.stringify(next));setDraft(next);applyNavigation(groups);onChange();}
  function move(key:string,target?:string,before?:string){if(!ready||busy)return;try{change(moveNode(draft.groups,key,target,before));}catch(e){toast.error((e as Error).message);}}
  function show(action:string,node?:StructureNode){setDialog({action,key:node?.key});setTitle(node?.title||'');setRoute('');setParent(node?.parent||'');setAudience(node?.audience||'both');}
  function submit(){try{
    if(!dialog)return;
    if(dialog.action==='refresh'){localStorage.removeItem(storageKey);setReload(n=>n+1);setDialog(null);return;}
    if(dialog.action==='rename'){if(!title.trim())throw new Error('Введите название');change(updateNode(draft.groups,selected!.key,{title:title.trim()}));}
    if(dialog.action==='audience')change(updateNode(draft.groups,selected!.key,{audience}));
    if(dialog.action==='move'||dialog.action==='nest'){if(dialog.action==='nest'&&!parent)throw new Error('Выберите родительский раздел или страницу');change(moveNode(draft.groups,selected!.key,parent||undefined));}
    if(dialog.action==='hide')change(updateNode(draft.groups,selected!.key,{hidden:true}));
    if(dialog.action==='page'||dialog.action==='category'){
      if(!title.trim())throw new Error('Введите название');const id=dialog.action==='page'?route.trim().replace(/^\/+|\/+$/g,''):'category/'+crypto.randomUUID();
      if(nodes.some(n=>n.id===id))throw new Error('Этот адрес уже занят, в том числе скрытой страницей');
      const next=navigationGroups([...nodes,{id,key:id,title:title.trim(),type:dialog.action,audience,parent:parent||undefined}]);validateNavigation(next);change(next);
    }
    setDialog(null);
  }catch(e){toast.error((e as Error).message);}}
  async function publish(){if(!repository){onConnect();return;}setBusy(true);try{
    await publisher().publishStructure(draft.groups,draft.base);
    const next={groups:draft.groups,base:structuredClone(draft.groups)};localStorage.removeItem(storageKey);setDraft(next);setDialog(null);toast.success('Структура отправлена на публикацию');
  }catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
  function destinationAllowed(key:string){let candidate=nodes.find(n=>n.key===key);while(candidate){if(candidate.key===selected?.key)return false;candidate=nodes.find(n=>n.key===candidate!.parent);}return true;}
  function tree(list:StructureNode[],parentKey?:string):React.ReactNode{return <ul className="structure-tree">{list.filter(n=>n.parent===parentKey).map(node=>{
    const children=list.some(n=>n.parent===node.key);
    const row=<div className={'structure-row '+(drop===node.key?'structure-drop':'')} draggable={!busy} onDragStart={e=>{e.stopPropagation();e.dataTransfer.setData('text/plain',node.key);setDrag(node.key);}} onDragEnd={()=>{setDrag(null);setDrop('');}} onDragOver={e=>{e.preventDefault();e.stopPropagation();setDrop(node.key);}} onDrop={e=>{e.preventDefault();e.stopPropagation();const key=drag||e.dataTransfer.getData('text/plain');const rect=e.currentTarget.getBoundingClientRect(),ratio=(e.clientY-rect.top)/rect.height;if(ratio<.25)move(key,node.parent,node.key);else if(ratio>.75){const siblings=nodes.filter(n=>n.parent===node.parent);move(key,node.parent,siblings[siblings.findIndex(n=>n.key===node.key)+1]?.key);}else move(key,node.key);setDrop('');setDrag(null);}}>
      <GripVertical size={16} aria-hidden="true"/><span className="structure-node-title">{node.title}</span><span className="structure-kind">{node.type==='category'?'Раздел':'Страница'}{node.audience==='both'?' · Обе аудитории':''}</span>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={'Действия: '+node.title}><MoreHorizontal size={18}/></Button></DropdownMenuTrigger><DropdownMenuContent>
        {node.type!=='category'&&<DropdownMenuItem onSelect={()=>onOpen(node.id)}>Открыть</DropdownMenuItem>}
        <DropdownMenuItem onSelect={()=>show('rename',node)}>Переименовать</DropdownMenuItem><DropdownMenuItem onSelect={()=>show('audience',node)}>Изменить аудиторию</DropdownMenuItem><DropdownMenuItem onSelect={()=>show('move',node)}>Переместить</DropdownMenuItem><DropdownMenuItem onSelect={()=>show('nest',node)}>Сделать вложенной</DropdownMenuItem><DropdownMenuItem disabled={!node.parent} onSelect={()=>move(node.key,nodes.find(n=>n.key===node.parent)?.parent)}>Вынести на уровень выше</DropdownMenuItem><DropdownMenuItem onSelect={()=>show('hide',node)}>Убрать из навигации</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
    </div>;
    return <li key={node.key}>{children?<details open><summary>{row}</summary>{tree(list,node.key)}</details>:row}</li>;
  })}</ul>;}
  return <section className="structure-manager" aria-label="Структура документации"><header><div><h1>Структура документации</h1><p>Порядок и вложенность не меняют адреса страниц. Структура общая для русского и английского языков.</p></div><div className="structure-actions"><Button variant="ghost" onClick={onClose}>К редактору страницы</Button><Button variant="ghost" disabled={busy} onClick={()=>dirty?setDialog({action:'refresh'}):setReload(n=>n+1)}>Загрузить с сайта</Button><DropdownMenu><DropdownMenuTrigger asChild><Button disabled={!ready||busy} variant="outline"><Plus size={16}/>Добавить</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={()=>show('page')}>Страница</DropdownMenuItem><DropdownMenuItem onSelect={()=>show('category')}>Раздел</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button disabled={!ready||busy||!dirty} onClick={()=>setDialog({action:'publish'})}>{busy?'Публикуем…':'Опубликовать структуру'}</Button></div></header>
    <p role="status">{loadError?'Не удалось загрузить структуру. Повторите загрузку.':!ready?'Загружаем структуру…':dirty?'Изменения сохранены на этом устройстве и ещё не опубликованы.':'Структура опубликована.'}</p><p className="form-help">Перетащите к верхнему или нижнему краю строки для изменения порядка, в центр — для вложения. Можно также воспользоваться меню «Переместить».</p>
    <fieldset disabled={!ready||busy} className="structure-columns">{(['business','developer'] as const).map(a=><section key={a} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(drag)move(drag);setDrag(null);}}><h2>{audienceLabels[a]}</h2>{tree(visibleTree(draft.groups,a))}</section>)}</fieldset>
    {nodes.some(n=>n.hidden)&&<details className="structure-hidden"><summary>Убраны из навигации</summary>{nodes.filter(n=>n.hidden).map(n=><div key={n.key} className="structure-row"><span>{n.title}</span>{n.type!=='category'&&<Button variant="ghost" onClick={()=>onOpen(n.id)}>Открыть</Button>}<Button variant="outline" disabled={busy} onClick={()=>change(updateNode(draft.groups,n.key,{hidden:false}))}>Вернуть в навигацию</Button></div>)}</details>}
    <Dialog open={!!dialog} onOpenChange={open=>{if(!open&&!busy)setDialog(null);}}><DialogContent><DialogHeader><DialogTitle>{({refresh:'Загрузить структуру с сайта?',page:'Добавить страницу',category:'Добавить раздел',rename:'Переименовать',audience:'Изменить аудиторию',move:'Переместить',nest:'Сделать вложенной',hide:'Убрать из навигации?',publish:'Опубликовать структуру?'} as Record<string,string>)[dialog?.action||'']}</DialogTitle><DialogDescription>{dialog?.action==='refresh'?'Локальные изменения структуры будут сброшены. Черновики текстов страниц сохранятся.':dialog?.action==='hide'?'Узел и его вложенные страницы исчезнут из меню. Содержимое и существующие ссылки сохранятся.':dialog?.action==='publish'?'На сайте обновится навигация для обеих аудиторий и языков. Новые страницы будут созданы пустыми; их текст публикуется из редактора отдельно.':'Адреса существующих страниц остаются прежними.'}</DialogDescription></DialogHeader>
      {['page','category','rename'].includes(dialog?.action||'')&&<label>Название<Input value={title} onChange={e=>setTitle(e.target.value)}/></label>}
      {dialog?.action==='page'&&<label>Адрес страницы<Input value={route} onChange={e=>setRoute(e.target.value)} placeholder="Например: tech/new-page"/><small>Задаётся один раз. Без домена, пробелов и префикса языка.</small></label>}
      {['page','category','audience'].includes(dialog?.action||'')&&<label>Аудитория<select aria-label="Аудитория" className="structure-select" value={audience} onChange={e=>setAudience(e.target.value as Audience)}>{Object.entries(audienceLabels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select>{dialog?.action==='audience'&&<small>Изменение применяется также ко всем вложенным страницам и разделам.</small>}</label>}
      {['page','category','move','nest'].includes(dialog?.action||'')&&<label>Родительский раздел или страница<select aria-label="Родительский раздел или страница" className="structure-select" value={parent} onChange={e=>setParent(e.target.value)}><option value="">Верхний уровень</option>{nodes.filter(n=>!n.hidden&&destinationAllowed(n.key)).map(n=><option key={n.key} value={n.key}>{n.title} — {n.id}</option>)}</select></label>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setDialog(null)}>Отмена</Button><Button disabled={busy} onClick={()=>dialog?.action==='publish'?void publish():submit()}>{dialog?.action==='refresh'?'Загрузить с сайта':dialog?.action==='publish'?'Опубликовать':dialog?.action==='hide'?'Убрать из навигации':'Сохранить'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
