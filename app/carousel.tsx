import {createContext,useContext,useRef,useState} from 'react';
import {Node,mergeAttributes} from '@tiptap/core';
import {NodeSelection} from '@tiptap/pm/state';
import {NodeViewWrapper,NodeViewContent,ReactNodeViewRenderer,type NodeViewProps} from '@tiptap/react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {uploadEditorImage,validateImageFile} from '@/lib/image-upload';
import {safeLink,type DocNode} from '@/lib/document';
import type {Repository} from '@/lib/repository';

export const ImageUploadContext=createContext<Repository|null>(null);
function CarouselView({node,editor,getPos,selected}:NodeViewProps){
  const repository=useContext(ImageUploadContext),input=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false),[active,setActive]=useState(0);
  const slides:DocNode[]=node.toJSON().content||[],index=Math.min(active,Math.max(0,slides.length-1)),slide=slides[index];
  function current(){const pos=getPos();if(typeof pos!=='number'||editor.isDestroyed)throw new Error('Карусель больше недоступна');const current=editor.state.doc.nodeAt(pos);if(current?.type.name!=='carousel'||current.attrs.id!==node.attrs.id)throw new Error('Карусель больше недоступна');return {pos,current};}
  function edit(transform:(slides:DocNode[])=>DocNode[]){
    const {pos,current:existing}=current(),next=editor.schema.nodeFromJSON({...existing.toJSON(),content:transform(existing.toJSON().content||[])});
    const tr=editor.state.tr.replaceWith(pos,pos+existing.nodeSize,next);tr.setSelection(NodeSelection.create(tr.doc,pos));editor.view.dispatch(tr);
  }
  function change(patch:Record<string,string>){edit(items=>items.map((item,i)=>i===index?{...item,attrs:{...item.attrs,...patch}}:item));}
  async function upload(files:File[]){
    if(!files.length||busy)return;
    try{files.forEach(validateImageFile);}catch(e){toast.error((e as Error).message);return;}
    setBusy(true);let added=0;
    try{
      // Use the same upload path as a single image and retain successful uploads.
      for(const file of files){current();const attrs=await uploadEditorImage(file,repository);edit(items=>[...items,{type:'image',attrs:{...attrs,caption:''}}]);added++;}
      toast.success('Изображения добавлены в карусель');
    }catch(e){toast.error((added?'Добавлено изображений: '+added+'. ':'')+(e as Error).message);}
    finally{setBusy(false);if(input.current)input.current.value='';}
  }
  function move(direction:number){const target=index+direction;if(target<0||target>=slides.length)return;edit(items=>{const result=[...items];result.splice(target,0,...result.splice(index,1));return result;});setActive(target);}
  return <NodeViewWrapper className={'carousel-editor '+(selected?'selected':'')} contentEditable={false}>
    <NodeViewContent style={{display:'none'}} aria-hidden="true"/>
    <div className="carousel-editor-header"><strong>Карусель</strong><Button variant="outline" size="sm" disabled={busy} onClick={()=>input.current?.click()}>{busy?'Загружаем…':'Добавить изображения'}</Button></div>
    <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Изображения для карусели" hidden onChange={e=>void upload(Array.from(e.target.files||[]))}/>
    {slide?<><div className="carousel-editor-frame"><img src={safeLink(slide.attrs?.src,true)} alt={slide.attrs?.alt||''}/></div><div className="carousel-editor-controls"><Button variant="ghost" disabled={index===0} aria-label="Предыдущее изображение" onClick={()=>setActive(index-1)}>←</Button><span aria-live="polite">{index+1} / {slides.length}</span><Button variant="ghost" disabled={index===slides.length-1} aria-label="Следующее изображение" onClick={()=>setActive(index+1)}>→</Button></div>
      <div className="carousel-thumbnails">{slides.map((item,i)=><button type="button" key={i} aria-label={'Изображение '+(i+1)} aria-pressed={i===index} onClick={()=>setActive(i)}><img src={safeLink(item.attrs?.src,true)} alt=""/><span>{i+1}</span></button>)}</div>
      <fieldset disabled={busy} className="carousel-fields"><label>Альтернативный текст<Input value={slide.attrs?.alt||''} onChange={e=>change({alt:e.target.value})}/></label><label>Подпись (необязательно)<Input value={slide.attrs?.caption||''} onChange={e=>change({caption:e.target.value})}/></label><div className="carousel-editor-controls"><Button variant="outline" size="sm" disabled={index===0} onClick={()=>move(-1)}>Переместить раньше</Button><Button variant="outline" size="sm" disabled={index===slides.length-1} onClick={()=>move(1)}>Переместить позже</Button><Button variant="ghost" size="sm" onClick={()=>{edit(items=>items.filter((_,i)=>i!==index));setActive(Math.max(0,index-1));}}>Удалить изображение</Button></div></fieldset>
    </>:<div className="carousel-empty">Добавьте изображения. Можно выбрать несколько файлов одновременно.</div>}
    <small>PNG, JPG, WebP или GIF, до 5 МБ на изображение. Удаление можно отменить в панели редактора.</small>
  </NodeViewWrapper>;
}
export const Carousel=Node.create({
  name:'carousel',group:'block',content:'image*',atom:true,isolating:true,draggable:true,selectable:true,
  addAttributes(){return {id:{default:null,parseHTML:el=>el.getAttribute('data-carousel-id')||crypto.randomUUID(),renderHTML:()=>({})}};},
  parseHTML(){return [{tag:'[data-editor-carousel]',getContent:(el,schema)=>{
    const images=Array.from((el as HTMLElement).querySelectorAll('img')).map(img=>schema.nodes.image.create({imageId:img.getAttribute('data-image-id'),src:img.getAttribute('src')||'',alt:img.getAttribute('alt')||'',caption:img.closest('[data-carousel-slide]')?.querySelector('figcaption')?.textContent||img.getAttribute('data-caption')||''}));
    return schema.nodes.carousel.create(null,images).content;
  }}];},
  renderHTML({node,HTMLAttributes}){return ['div',mergeAttributes(HTMLAttributes,{'data-editor-carousel':'','data-carousel-id':node.attrs.id}),0];},
  addNodeView(){return ReactNodeViewRenderer(CarouselView);}
});
