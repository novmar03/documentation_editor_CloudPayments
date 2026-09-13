import {Node} from '@tiptap/core';
import {NodeViewWrapper,ReactNodeViewRenderer,type NodeViewProps} from '@tiptap/react';
import {useEffect,useRef,useState} from 'react';
import {toBase64} from '../lib/github/repository.ts';
import {renderDocument,safeLink} from '../lib/document/model.ts';
import {installInteractions} from '../lib/runtime/interactions.js';

function AnchorView({node}:NodeViewProps){return <NodeViewWrapper as="span" contentEditable={false} style={{display:'inline-block',padding:'2px 8px',border:'1px dashed #799bcc',borderRadius:4,color:'#326dff'}}>⚓ {node.attrs.id}</NodeViewWrapper>;}
export const Anchor=Node.create({name:'anchor',inline:true,group:'inline',atom:true,selectable:true,
  addAttributes(){return {id:{default:''}};},
  parseHTML(){return [{tag:'span[data-doc-anchor]'}];},
  renderHTML({node}){return ['span',{'data-doc-anchor':'',id:node.attrs.id,class:'doc-anchor'}];},
  addNodeView(){return ReactNodeViewRenderer(AnchorView);},
});
function CarouselView({node,updateAttributes,editor,getPos}:NodeViewProps){
  const ref=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const slides=node.attrs.slides||[];
  const html=renderDocument({type:'doc',content:[{type:'carousel',attrs:node.attrs}]});
  useEffect(()=>ref.current?installInteractions(ref.current):undefined,[html]);
  async function upload(files:FileList|null){
    if(!files?.length)return;setBusy(true);setError('');
    try{
      const selected=Array.from(files);
      if(slides.length+selected.length>12)throw new Error('Не больше 12 изображений в карусели');
      for(const f of selected)if(!['image/png','image/jpeg','image/webp','image/gif'].includes(f.type)||f.size>5*1024*1024)throw new Error('PNG, JPG, WebP или GIF, не больше 5 МБ на файл');
      if(JSON.stringify(slides).length+selected.reduce((n,f)=>n+Math.ceil(f.size*4/3),0)>20*1024*1024)throw new Error('Общий размер изображений — до 15 МБ');
      const added=await Promise.all(selected.map(async f=>({src:`data:${f.type};base64,${toBase64(new Uint8Array(await f.arrayBuffer()))}`,alt:f.name})));
      const pos=getPos(),current=typeof pos==='number'?editor.state.doc.nodeAt(pos):null;
      if(current?.type.name==='carousel')updateAttributes({slides:[...current.attrs.slides,...added]});
    }catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки');}finally{setBusy(false);if(input.current)input.current.value='';}
  }
  return <NodeViewWrapper className="carousel-editor" contentEditable={false} style={{padding:16,border:'1px solid #ccd6e4',borderRadius:10}}>
    <strong>Карусель</strong><div ref={ref} dangerouslySetInnerHTML={{__html:html}}/>
    <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e=>void upload(e.target.files)}/>
    <button type="button" disabled={busy} onClick={()=>input.current?.click()}>{busy?'Загрузка…':'Добавить фотографии'}</button>
    {error&&<p role="alert">{error}</p>}
    {slides.map((s:any,i:number)=><div key={i} style={{display:'flex',gap:8,marginTop:8}}>
      <img src={safeLink(s.src,true)} alt="" style={{width:44,height:36,objectFit:'cover'}}/>
      <input aria-label={`Описание слайда ${i+1}`} value={s.alt||''} onChange={e=>updateAttributes({slides:slides.map((x:any,k:number)=>k===i?{...x,alt:e.target.value}:x)})}/>
      <button type="button" aria-label={`Слайд ${i+1} выше`} disabled={busy||i===0} onClick={()=>{const copy=[...slides];[copy[i-1],copy[i]]=[copy[i],copy[i-1]];updateAttributes({slides:copy});}}>↑</button>
      <button type="button" aria-label={`Слайд ${i+1} ниже`} disabled={busy||i===slides.length-1} onClick={()=>{const copy=[...slides];[copy[i+1],copy[i]]=[copy[i],copy[i+1]];updateAttributes({slides:copy});}}>↓</button>
      <button type="button" aria-label={`Удалить слайд ${i+1}`} disabled={busy} onClick={()=>updateAttributes({slides:slides.filter((_:any,k:number)=>k!==i)})}>Удалить</button>
    </div>)}
    <p>Автопрокрутка каждые 3 секунды. При наведении и работе с кнопками она приостанавливается.</p>
  </NodeViewWrapper>;
}
export const Carousel=Node.create({name:'carousel',group:'block',atom:true,selectable:true,draggable:true,
  addAttributes(){return {slides:{default:[]}};},
  parseHTML(){return [{tag:'section[data-doc-carousel]',getAttrs:el=>({slides:[...(el as HTMLElement).querySelectorAll('[data-slide] img')].map(img=>({src:img.getAttribute('src'),alt:img.getAttribute('alt')||''}))})}];},
  renderHTML({node}){return ['section',{'data-doc-carousel':''},...node.attrs.slides.map((s:any)=>['figure',{'data-slide':''},['img',{src:safeLink(s.src,true),alt:s.alt||''}]])];},
  addNodeView(){return ReactNodeViewRenderer(CarouselView);},
});
