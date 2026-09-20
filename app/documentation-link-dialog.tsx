import {useEffect,useState} from 'react';
import type {Editor} from '@tiptap/react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {toast} from 'sonner';
import {safeLink,type DocNode} from '@/lib/document';
import {documentationHref,parseDocumentationHref,pageSections,localePages,type DocumentationData} from '@/lib/documentation-links';
import {DOCS_URL,DOCS_REPO} from '@/lib/config';
import {pages} from '@/lib/navigation';
import {Publisher} from '@/lib/publish';
import type {Repository} from '@/lib/repository';
import type {Locale} from '@/lib/locales';

export function DocumentationLinkDialog({editor,open,onOpenChange,pageId,locale,repository}:{editor:Editor;open:boolean;onOpenChange:(open:boolean)=>void;pageId:string;locale:Locale;repository:Repository|null}){
 const [kind,setKind]=useState<'external'|'documentation'>('external'),[url,setUrl]=useState('');
 const [selectedPage,setSelectedPage]=useState(pageId),[anchor,setAnchor]=useState('');
 const [data,setData]=useState<DocumentationData>({pages}),[loading,setLoading]=useState(false),[warning,setWarning]=useState('');
 const [selection,setSelection]=useState({from:0,to:0});
 useEffect(()=>{
  if(!open)return;
  setSelection({from:editor.state.selection.from,to:editor.state.selection.to});
  const href=editor.getAttributes('link').href||'';
  const parsed=parseDocumentationHref(href,Object.keys(data.pages));
  setKind(parsed?'documentation':'external');setUrl(href);setSelectedPage(parsed?.id||pageId);setAnchor(parsed?.anchor||'');
  let cancelled=false;setLoading(true);setWarning('');
  (async()=>{
   let html:string;
   if(repository){const publisher=new Publisher({provider:'github',project:DOCS_REPO,branch:'main',host:'',token:repository.config.token});const file=await publisher.file('index.html');if(!file)throw new Error('Нет документации');html=file.content;}
   else {const response=await fetch(DOCS_URL,{cache:'no-cache'});if(!response.ok)throw new Error('Нет документации');html=await response.text();}
   const json=new DOMParser().parseFromString(html,'text/html').getElementById('document-data')?.textContent;
   if(!json)throw new Error('Нет списка страниц');
   const published=JSON.parse(json) as DocumentationData;
   if(!published.pages)throw new Error('Нет списка страниц');
   if(!cancelled){setData(published);const existing=parseDocumentationHref(href,Object.keys(published.pages));if(existing){setKind('documentation');setSelectedPage(existing.id);setAnchor(existing.anchor);}}
  })().catch(()=>{if(!cancelled)setWarning('Не удалось обновить список. Доступны сохранённые страницы; разделы текущей страницы актуальны.');}).finally(()=>{if(!cancelled)setLoading(false);});
  return()=>{cancelled=true;};
 },[open,editor,pageId,locale,repository]);
 const localized=localePages(data,locale);
 const sections=selectedPage===pageId?pageSections({id:pageId,title:'',content:editor.getJSON() as DocNode}):pageSections(localized[selectedPage]);
 const missing=!!anchor&&!sections.some(h=>h.id===anchor);
 function apply(){
  const href=kind==='documentation'?documentationHref(selectedPage,locale,anchor):safeLink(url);
  if(!href){toast.error('Введите корректную ссылку');return;}
  if(kind==='documentation'&&(!data.pages[selectedPage]||missing||loading))return;
  const chain=editor.chain().focus().setTextSelection(selection);
  if(selection.from===selection.to&&!editor.isActive('link'))chain.insertContent({type:'text',text:href,marks:[{type:'link',attrs:{href}}]}).run();
  else chain.extendMarkRange('link').setLink({href}).run();
  onOpenChange(false);
 }
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Ссылка в тексте</DialogTitle><DialogDescription>Выделите текст и выберите, куда ведёт ссылка.</DialogDescription></DialogHeader>
  <fieldset className="link-kind"><legend className="sr-only">Тип ссылки</legend><label><input type="radio" name="link-kind" checked={kind==='external'} onChange={()=>setKind('external')}/> Внешняя ссылка</label><label><input type="radio" name="link-kind" checked={kind==='documentation'} onChange={()=>setKind('documentation')}/> Документация</label></fieldset>
  {kind==='external'?<Input aria-label="Адрес ссылки" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://"/>:<div className="documentation-link-fields">
   <Label htmlFor="link-page">Страница</Label><select id="link-page" value={selectedPage} onChange={e=>{setSelectedPage(e.target.value);setAnchor('');}}>{Object.values(data.pages).map(p=><option key={p.id} value={p.id}>{localized[p.id]?.title||p.title}</option>)}</select>
   <Label htmlFor="link-section">Раздел</Label><select id="link-section" value={anchor} onChange={e=>setAnchor(e.target.value)} disabled={loading}><option value="">Вся страница</option>{missing&&<option value={anchor} disabled>Раздел больше недоступен</option>}{sections.map(h=><option key={h.id} value={h.id}>{'　'.repeat(h.level-2)}{h.title||'Без названия'} · H{h.level}</option>)}</select>
   {loading&&<p role="status" className="form-help">Загружаем разделы…</p>}{warning&&<p role="status" className="form-help">{warning}</p>}{missing&&<p role="alert">Выберите существующий раздел или всю страницу.</p>}
  </div>}
  <DialogFooter><Button variant="outline" onClick={()=>{editor.chain().focus().setTextSelection(selection).extendMarkRange('link').unsetLink().run();onOpenChange(false);}}>Удалить ссылку</Button><Button onClick={apply} disabled={kind==='documentation'&&(loading||missing||!data.pages[selectedPage])}>{kind==='documentation'?'Добавить ссылку':'Применить'}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
