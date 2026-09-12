export type DocNode = {type:string; attrs?:Record<string,any>; text?:string; marks?:{type:string;attrs?:Record<string,any>}[]; content?:DocNode[]};
export type Page = {id:string; title:string; group:string; content?:DocNode; html?:string; version:number; publishedVersion:number; updated?:string};
export const escapeHtml=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const textOf=(n:DocNode):string=>n.text??(n.content||[]).map(textOf).join('');
export const slug=(text:string)=>text.toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu,'').replace(/\s/g,'-')||'section';
export function safeLink(value:unknown,image=false):string {
  const s=String(value||'').trim();
  if(image&&/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(s))return s;
  if((s.startsWith('/')&&!s.startsWith('//'))||s.startsWith('#'))return s;
  try{const u=new URL(s);if((image?['http:','https:']:['http:','https:','mailto:','tel:']).includes(u.protocol))return u.href;}catch{}
  return '';
}
const allowed=new Set(['doc','paragraph','text','heading','bulletList','orderedList','listItem','codeBlock','blockquote','hardBreak','horizontalRule','table','tableRow','tableCell','tableHeader','image','callout','docButton','plantuml','carousel']);
export function assertPublishable(doc:DocNode){
  function visit(n:DocNode){
    if(n.type==='plantuml'&&(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(n.attrs?.src||'')||!n.attrs?.source?.trim()||n.attrs.source!==n.attrs.renderedSource))throw new Error('Обновите рендер всех диаграмм PlantUML перед публикацией или скачиванием.');
    if(n.type==='carousel'&&(!Array.isArray(n.attrs?.slides)||!n.attrs.slides.length||n.attrs.slides.some((s:any)=>!safeLink(s.src,true))))throw new Error('Добавьте изображения в каждую карусель перед публикацией или скачиванием.');
    n.content?.forEach(visit);
  }visit(doc);
}
export function validateDocument(doc:DocNode) {
  let count=0;
  const walk=(n:DocNode,depth:number)=>{
    if(!n||!allowed.has(n.type)||depth>30||++count>60000)throw new Error('Неподдерживаемый формат документа');
    if(n.text!==undefined&&typeof n.text!=='string')throw new Error('Некорректный текст');
    if(n.content&&!Array.isArray(n.content))throw new Error('Некорректные блоки');
    (n.content||[]).forEach(child=>walk(child,depth+1));
  };
  if(doc?.type!=='doc')throw new Error('Ожидается документ');walk(doc,0);
  if(JSON.stringify(doc).length>1500000)throw new Error('Страница слишком большая. Изображения добавляйте через загрузку файлов.');
}
export function normalizeHeadings(doc:DocNode):DocNode {
  const copy=structuredClone(doc),used=new Set<string>();
  function walk(n:DocNode){
    if(n.type==='heading'){
      n.attrs={...n.attrs,level:Math.min(6,Math.max(2,Number(n.attrs?.level)||2))};
      let id=String(n.attrs.id||slug(textOf(n))),base=id,k=1;
      while(used.has(id))id=base+'-'+k++;
      n.attrs.id=id;used.add(id);
    }
    n.content?.forEach(walk);
  }
  walk(copy);return copy;
}
export function headings(doc:DocNode){
  const list:{id:string;title:string;level:number;index:number}[]=[];
  doc.content?.forEach((n,index)=>{if(n.type==='heading')list.push({id:n.attrs?.id||slug(textOf(n)),title:textOf(n),level:n.attrs?.level||2,index});});return list;
}
export function moveSection(doc:DocNode,index:number,direction:number):DocNode {
  const result=structuredClone(doc),nodes=result.content||[],node=nodes[index];
  if(node?.type!=='heading')return result;
  const level=node.attrs?.level||2;
  const end=(start:number)=>{for(let i=start+1;i<nodes.length;i++)if(nodes[i].type==='heading'&&(nodes[i].attrs?.level||2)<=level)return i;return nodes.length;};
  let target=-1;
  for(let i=index+direction;i>=0&&i<nodes.length;i+=direction){if(nodes[i].type==='heading'){const l=nodes[i].attrs?.level||2;if(l<level)break;if(l===level){target=i;break;}}}
  if(target<0)return result;
  const length=end(index)-index,destination=direction<0?target:end(target)-length;
  nodes.splice(destination,0,...nodes.splice(index,length));return result;
}
const num=(value:unknown,min:number,max:number,fallback:number)=>Math.max(min,Math.min(max,Number(value)||fallback));
export function renderDocument(doc:DocNode):string {
  let codeIndex=0;
  const render=(n:DocNode):string=>{
    const a=n.attrs||{},inside=()=>n.content?.map(render).join('')||'';
    const align=['left','center','right','justify'].includes(a.textAlign)?` style="text-align:${a.textAlign}"`:'';
    switch(n.type){
      case 'doc':return inside();
      case 'text':{
        let s=escapeHtml(n.text);for(const m of n.marks||[]){
          const tags:Record<string,string>={bold:'strong',italic:'em',underline:'u',strike:'s',code:'code'};
          if(tags[m.type])s=`<${tags[m.type]}>${s}</${tags[m.type]}>`;
          if(m.type==='link'){const href=safeLink(m.attrs?.href);if(href)s=`<a href="${escapeHtml(href)}"${href.startsWith('http')?' target="_blank" rel="noopener noreferrer"':''}>${s}</a>`;}
        }return s;
      }
      case 'paragraph':return `<p${align}>${inside()||'<br>'}</p>`;
      case 'heading':{const level=num(a.level,2,6,2);return `<h${level} id="${escapeHtml(a.id||slug(textOf(n)))}"${align}>${inside()}</h${level}>`;}
      case 'bulletList':return `<ul>${inside()}</ul>`;
      case 'orderedList':return `<ol start="${num(a.start,1,10000,1)}">${inside()}</ol>`;
      case 'listItem':return `<li>${inside()}</li>`;
      case 'blockquote':return `<blockquote>${inside()}</blockquote>`;
      case 'hardBreak':return '<br>';
      case 'horizontalRule':return '<hr>';
      case 'codeBlock':{const id='editor-code-'+ ++codeIndex;return `<div class="api-code-block"><div class="api-code-toolbar"><span>${escapeHtml(a.language||'text')}</span><button type="button" data-copy-code="${id}" data-copy-state="ready" aria-label="Копировать код" title="Копировать код"><svg class="api-copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="9" y="9" width="11" height="12" rx="2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg><svg class="api-copy-success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span class="api-copy-status" data-copy-status role="status" aria-live="polite"></span></button></div><pre class="api-code"><code id="${id}" class="language-${escapeHtml(a.language||'text')}">${escapeHtml(textOf(n))}</code></pre></div>`;}
      case 'callout':return `<aside class="api-callout ${a.kind==='attention'?'warning':''}" role="note"><strong class="callout-label">${a.kind==='attention'?'Внимание':'Информация'}</strong>${inside()}</aside>`;
      case 'table':{
        const widths=(n.content?.[0]?.content||[]).flatMap(cell=>Array.from({length:num(cell.attrs?.colspan,1,50,1)},(_,i)=>cell.attrs?.colwidth?.[i]||0));
        const sized=widths.some(w=>w>0);
        const columns=sized?`<colgroup>${widths.map(w=>`<col style="width:${num(w,60,1200,180)}px">`).join('')}</colgroup>`:'';
        const style=sized?` style="table-layout:fixed;width:${widths.reduce((sum,w)=>sum+num(w,60,1200,180),0)}px;min-width:0"`:'';
        return `<div class="api-table-scroll" tabindex="0" aria-label="Таблица"><table data-freeze-row="${a.freezeRow===true}" data-freeze-column="${a.freezeColumn===true}"${style}>${columns}${inside()}</table></div>`;
      }
      case 'tableRow':return `<tr>${inside()}</tr>`;
      case 'tableCell':case 'tableHeader':{const tag=n.type==='tableCell'?'td':'th';return `<${tag} colspan="${num(a.colspan,1,50,1)}" rowspan="${num(a.rowspan,1,100,1)}">${inside()}</${tag}>`;}
      case 'image':{const src=safeLink(a.src,true);return src?`<figure style="text-align:${['left','right'].includes(a.align)?a.align:'center'}"><img src="${escapeHtml(src)}" alt="${escapeHtml(a.alt||'')}" style="width:${num(a.width,10,100,100)}%;max-width:100%;height:auto"></figure>`:'';}
      case 'plantuml':{
        const src=a.source===a.renderedSource&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(a.src||'')?a.src:'';
        return src?`<figure class="doc-plantuml"><img src="${escapeHtml(src)}" alt="${escapeHtml(a.alt||'Диаграмма')}"></figure>`:'<p role="status">Диаграмма ещё не построена. Обновите рендер в редакторе.</p>';
      }
      case 'carousel':{
        const slides=(Array.isArray(a.slides)?a.slides:[]).filter((s:any)=>safeLink(s.src,true));
        if(!slides.length)return '<p role="status">Добавьте изображения в карусель.</p>';
        return `<section class="doc-carousel" aria-roledescription="карусель" aria-label="${escapeHtml(a.label||'Галерея изображений')}" tabindex="0"><div class="doc-carousel-stage">${slides.map((s:any,i:number)=>`<figure data-carousel-slide role="group" aria-roledescription="слайд" aria-label="${i+1} из ${slides.length}"${i?' hidden':''}><img src="${escapeHtml(safeLink(s.src,true))}" alt="${escapeHtml(s.alt||'')}" draggable="false"></figure>`).join('')}</div>${slides.length>1?`<div class="doc-carousel-controls"><button type="button" data-carousel-action="previous" aria-label="Предыдущее изображение">&#8592;</button><span data-carousel-counter>1 / ${slides.length}</span><button type="button" data-carousel-action="next" aria-label="Следующее изображение">&#8594;</button><div class="doc-carousel-dots">${slides.map((_:any,i:number)=>`<button type="button" data-carousel-index="${i}" aria-label="Показать изображение ${i+1}" aria-current="${i===0}"></button>`).join('')}</div><button type="button" data-carousel-action="pause" aria-label="Приостановить автопрокрутку">Пауза</button></div>`:''}<span class="doc-media-sr" data-carousel-status aria-live="polite" aria-atomic="true"></span></section>`;
      }
      case 'docButton':{const href=safeLink(a.href);return `<div style="text-align:${['left','right'].includes(a.align)?a.align:'center'};margin:24px 0"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;background:#326dff;color:#fff;text-decoration:none;border-radius:12px;padding:12px 20px;max-width:100%;width:${a.fullWidth?'100%':num(a.width,80,1000,240)+'px'};min-height:${num(a.height,32,200,56)}px;font-size:${num(a.fontSize,12,40,18)}px;font-weight:600">${escapeHtml(a.label||'Кнопка')}</a></div>`;}
      default:return '';
    }
  };
  return '<div class="imported-api">'+render(normalizeHeadings(doc))+'</div>';
}
