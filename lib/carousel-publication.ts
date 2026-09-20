import runtimeSource from './carousel-runtime.js?raw';

export {runtimeSource as carouselRuntimeSource};
export const carouselScript=runtimeSource.replace('export function installCarouselRuntime','function installCarouselRuntime')+'\ninstallCarouselRuntime(document);';
export function installCarouselHtml(html:string){
  const script='<script id="editor-carousel-runtime">'+carouselScript+'</script>';
  return html.includes('id="editor-carousel-runtime"')?html.replace(/<script id="editor-carousel-runtime">[\s\S]*?<\/script>/,()=>script):html.replace('</body>',()=>script+'\n</body>');
}
export function installCarouselComponent(source:string){
  if(source.includes('useCarouselEffect'))return source;
  if(!source.includes(' return <div'))throw new Error('Не удалось подключить карусель к компоненту документации');
  return "import {useEffect as useCarouselEffect,useRef as useCarouselRef} from 'react';\nimport {installCarouselRuntime} from './carousel-runtime';\n"+source.replace(' return <div'," const carouselRoot=useCarouselRef(null);\n useCarouselEffect(()=>installCarouselRuntime(carouselRoot.current),[html]);\n return <div ref={carouselRoot}");
}
