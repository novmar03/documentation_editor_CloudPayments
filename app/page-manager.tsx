import {useState} from 'react';
import {type PageChange,applyPageChanges} from '../lib/document/page-structure.ts';
export function PageManager({data,onPublish,onClose}:{data:any;onPublish:(ops:PageChange[])=>Promise<void>;onClose:()=>void}){
  const [ops,setOps]=useState<PageChange[]>([]),[title,setTitle]=useState(''),[id,setId]=useState(''),[group,setGroup]=useState(data.groups[0]?.id||''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[deleting,setDeleting]=useState<string|null>(null);
  const current=applyPageChanges(data,ops);
  function add(op:PageChange){try{applyPageChanges(data,[...ops,op]);setOps([...ops,op]);setError('');}catch(e){setError((e as Error).message);}}
  return <div className="page-manager" style={{maxHeight:'70vh',overflow:'auto'}}>
    <p>Изменения появятся на сайте после нажатия «Опубликовать структуру». Порядок меняется внутри раздела.</p>
    <fieldset disabled={busy}><legend>Новая страница</legend>
    <label>Название<input aria-label="Название новой страницы" value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label>Адрес<input aria-label="Адрес новой страницы" placeholder="guides/new-page" value={id} onChange={e=>setId(e.target.value)}/></label>
    <label>Раздел<select aria-label="Раздел новой страницы" value={group} onChange={e=>setGroup(e.target.value)}>{data.groups.map((g:any)=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
    <button type="button" onClick={()=>{try{const op:PageChange={type:'create',id,title,group};applyPageChanges(data,[...ops,op]);add(op);setId('');setTitle('');}catch(e){setError((e as Error).message);}}}>Добавить страницу</button>
    </fieldset>
    {current.groups.map((g:any)=><section key={g.id}><h3>{g.title}</h3>{g.items.map((p:any,i:number)=><div key={p.id} style={{display:'flex',gap:8,alignItems:'center',margin:'8px 0'}}><span style={{flex:1}}>{p.title}</span><button type="button" disabled={busy||i===0} aria-label={`${p.title}: выше`} onClick={()=>add({type:'move',id:p.id,direction:-1})}>↑</button><button type="button" disabled={busy||i===g.items.length-1} aria-label={`${p.title}: ниже`} onClick={()=>add({type:'move',id:p.id,direction:1})}>↓</button><button type="button" disabled={busy} aria-label={`Удалить страницу ${p.title}`} onClick={()=>setDeleting(p.id)}>Удалить</button></div>)}</section>)}
    {deleting&&<div role="alert"><p>Удалить «{current.pages[deleting]?.title}» с сайта? По старым ссылкам будет показано сообщение об удалении. История GitHub и черновики сохранятся.</p><button type="button" onClick={()=>{add({type:'delete',id:deleting});setDeleting(null);}}>Подтвердить удаление</button><button type="button" onClick={()=>setDeleting(null)}>Оставить страницу</button></div>}
    {error&&<p role="alert">{error}</p>}
    <button type="button" disabled={busy||!ops.length||!!deleting} onClick={async()=>{setBusy(true);try{await onPublish(ops);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Публикуем…':'Опубликовать структуру'}</button>
    <button type="button" disabled={busy} onClick={onClose}>Отмена</button>
  </div>;
}
