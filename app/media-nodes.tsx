import {Node,Extension} from '@tiptap/core';
import {TableView} from '@tiptap/extension-table';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import type {EditorView} from '@tiptap/pm/view';
import {NodeViewWrapper,ReactNodeViewRenderer,type NodeViewProps} from '@tiptap/react';
import {useEffect,useRef,useState} from 'react';
import {ImagePlus,ArrowUp,ArrowDown,Trash2,RefreshCw,Loader2} from 'lucide-react';
import {renderDocument} from '../lib/document';
import {renderPlantUml} from '../lib/plantuml.js';
import {toBase64} from '../lib/repository';

export const examplePlantUml='@startuml\nactor Клиент\nparticipant Магазин\nparticipant CloudPayments\nКлиент -> Магазин: Оформить заказ\nМагазин -> CloudPayments: Запрос оплаты\nCloudPayments --> Магазин: Результат оплаты\nМагазин --> Клиент: Подтверждение\n@enduml';

function PlantUmlView({node,updateAttributes,selected}:NodeViewProps){
  const a=node.attrs;
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef<AbortController|null>(null),latest=useRef(a.source);
  latest.current=a.source;
  useEffect(()=>()=>request.current?.abort(),[]);
  async function render(){
    request.current?.abort();
    const controller=new AbortController();request.current=controller;
    const source=a.source;
    setBusy(true);setError('');
    const timeout=setTimeout(()=>controller.abort(),30000);
    try{
      const src=await renderPlantUml(source,controller.signal);
      if(latest.current===source&&!controller.signal.aborted)updateAttributes({src,renderedSource:source});
    }catch(e){if(request.current===controller)setError(controller.signal.aborted?'Не удалось дождаться рендера. Попробуйте ещё раз.':e instanceof Error?e.message:'Сервис рендера недоступен. Проверьте соединение.');}
    finally{clearTimeout(timeout);if(request.current===controller)setBusy(false);}
  }
  return <NodeViewWrapper className={'media-editor-node '+(selected?'selected':'')} contentEditable={false}>
    <div className="media-editor-title"><strong>Диаграмма PlantUML</strong><span>Код + рендер</span></div>
    <div className="plantuml-panes"><label className="plantuml-source"><span>Код PlantUML</span><textarea aria-label="Код PlantUML" spellCheck={false} value={a.source} onChange={e=>{request.current?.abort();request.current=null;setBusy(false);setError('');updateAttributes({source:e.target.value,src:'',renderedSource:''});}}/></label>
    <div className="plantuml-preview"><span>Предпросмотр</span>{a.src&&a.source===a.renderedSource?<img src={a.src} alt={a.alt||'Диаграмма'}/>:<p>Нажмите «Обновить рендер», чтобы построить диаграмму.</p>}</div></div>
    <div className="media-editor-actions"><button type="button" disabled={busy||!a.source.trim()} onClick={()=>void render()}>{busy?<Loader2 size={16} className="spin"/>:<RefreshCw size={16}/>} {busy?'Строим диаграмму…':'Обновить рендер'}</button></div>
    {error&&<p role="alert" className="media-error">{error}</p>}
    <label className="media-alt">Описание диаграммы<input value={a.alt||''} onChange={e=>updateAttributes({alt:e.target.value})} placeholder="Что показано на диаграмме"/></label>
    <p className="media-help">При рендере код отправляется сервису Kroki. В документации отображается сохранённое изображение.</p>
  </NodeViewWrapper>;
}

type Slide={src:string;alt:string;assetPath?:string};
export class FrozenTableView extends TableView {
  constructor(node:ProseMirrorNode,cellMinWidth:number,view:EditorView,attributes:Record<string,any>={}){
    super(node,cellMinWidth,view,attributes);this.syncFrozen(node);
    this.dom.tabIndex=0;this.dom.setAttribute('aria-label','Таблица');
  }
  syncFrozen(node:ProseMirrorNode){this.table.dataset.freezeRow=String(!!node.attrs.freezeRow);this.table.dataset.freezeColumn=String(!!node.attrs.freezeColumn);}
  update(node:ProseMirrorNode){const updated=super.update(node);if(updated)this.syncFrozen(node);return updated;}
}
function CarouselView({node,updateAttributes,selected,editor,getPos}:NodeViewProps){
  const slides:Slide[]=node.attrs.slides||[];
  const file=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const latest=useRef(slides);latest.current=slides;
  function currentNode(){const pos=getPos();return typeof pos==='number'?editor.state.doc.nodeAt(pos):null;}
  async function upload(files:FileList|null){
    if(!files?.length)return;
    const chosen=Array.from(files);setError('');setBusy(true);
    try{
      if(slides.length+chosen.length>12)throw new Error('В одной карусели можно разместить до 12 изображений.');
      for(const image of chosen){if(!['image/png','image/jpeg','image/webp','image/gif'].includes(image.type))throw new Error('Выберите PNG, JPG, WebP или GIF.');if(image.size>5*1024*1024)throw new Error('Каждое изображение должно быть не больше 5 МБ.');}
      if(slides.reduce((n,s)=>n+s.src.length,0)+chosen.reduce((n,f)=>n+Math.ceil(f.size*4/3),0)>20*1024*1024)throw new Error('Общий размер изображений карусели — до 15 МБ.');
      const added=await Promise.all(chosen.map(async image=>({src:`data:${image.type};base64,${toBase64(new Uint8Array(await image.arrayBuffer()))}`,alt:image.name})));
      if(currentNode()?.type.name==='carousel')updateAttributes({slides:[...latest.current,...added]});
    }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить изображения.');}
    finally{setBusy(false);if(file.current)file.current.value='';}
  }
  function move(i:number,by:number){const copy=[...slides];[copy[i],copy[i+by]]=[copy[i+by],copy[i]];updateAttributes({slides:copy});}
  return <NodeViewWrapper className={'media-editor-node '+(selected?'selected':'')} contentEditable={false}>
    <div className="media-editor-title"><strong>Карусель изображений</strong><span>Каждые 3 секунды</span></div>
    <div dangerouslySetInnerHTML={{__html:renderDocument({type:'doc',content:[{type:'carousel',attrs:node.attrs}]})}}/>
    <input ref={file} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e=>void upload(e.target.files)}/>
    <div className="media-editor-actions"><button type="button" disabled={busy||slides.length>=12} onClick={()=>file.current?.click()}>{busy?<Loader2 className="spin" size={16}/>:<ImagePlus size={16}/>} Выбрать изображения</button><span>{slides.length} / 12</span></div>
    {error&&<p role="alert" className="media-error">{error}</p>}
    <div className="carousel-slide-list">{slides.map((slide,i)=><div className="carousel-slide-setting" key={i}>
      <img src={slide.src} alt=""/><input aria-label={`Описание изображения ${i+1}`} placeholder="Описание изображения" value={slide.alt} onChange={e=>updateAttributes({slides:slides.map((s,k)=>k===i?{...s,alt:e.target.value}:s)})}/>
      <button type="button" title="Переместить выше" aria-label={`Переместить изображение ${i+1} выше`} disabled={i===0} onClick={()=>move(i,-1)}><ArrowUp size={16}/></button>
      <button type="button" title="Переместить ниже" aria-label={`Переместить изображение ${i+1} ниже`} disabled={i===slides.length-1} onClick={()=>move(i,1)}><ArrowDown size={16}/></button>
      <button type="button" title="Удалить изображение" aria-label={`Удалить изображение ${i+1}`} onClick={()=>updateAttributes({slides:slides.filter((_,k)=>k!==i)})}><Trash2 size={16}/></button>
    </div>)}</div>
    <p className="media-help">PNG, JPG, WebP и GIF. До 5 МБ на файл, до 15 МБ на карусель. При наведении или работе с кнопками автопрокрутка приостанавливается.</p>
  </NodeViewWrapper>;
}

export const PlantUml=Node.create({name:'plantuml',group:'block',atom:true,draggable:true,selectable:true,
  addAttributes(){return {source:{default:examplePlantUml},renderedSource:{default:''},src:{default:''},alt:{default:''}};},
  parseHTML(){return [{tag:'div[data-type="plantuml"]',getAttrs:el=>{try{return JSON.parse((el as HTMLElement).dataset.node||'{}');}catch{return false;}}}];},
  renderHTML({node}){return ['div',{'data-type':'plantuml','data-node':JSON.stringify(node.attrs)},'Диаграмма PlantUML'];},
  addNodeView(){return ReactNodeViewRenderer(PlantUmlView);},
});
export const Carousel=Node.create({name:'carousel',group:'block',atom:true,draggable:true,selectable:true,
  addAttributes(){return {slides:{default:[]},label:{default:'Галерея изображений'}};},
  parseHTML(){return [{tag:'div[data-type="carousel"]',getAttrs:el=>{try{return JSON.parse((el as HTMLElement).dataset.node||'{}');}catch{return false;}}}];},
  renderHTML({node}){return ['div',{'data-type':'carousel','data-node':JSON.stringify(node.attrs)},'Карусель изображений'];},
  addNodeView(){return ReactNodeViewRenderer(CarouselView);},
});
export const FrozenTable=Extension.create({name:'frozenTable',addGlobalAttributes(){return [{types:['table'],attributes:{
  freezeRow:{default:false,parseHTML:el=>el.getAttribute('data-freeze-row')==='true',renderHTML:a=>({'data-freeze-row':String(a.freezeRow)})},
  freezeColumn:{default:false,parseHTML:el=>el.getAttribute('data-freeze-column')==='true',renderHTML:a=>({'data-freeze-column':String(a.freezeColumn)})},
}}];}});
