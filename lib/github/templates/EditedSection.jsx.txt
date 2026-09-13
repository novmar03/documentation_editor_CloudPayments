import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import content from '../content/editor-pages.json?render';
import {handleCodeCopy} from './document-ui';
export default function EditedSection({page,index}) {
 const base=useBaseUrl('/');
 const html=(content[page]?.segments[index]||'').replaceAll('__EDITOR_ASSET__/',base+'assets/editor-media/').replace(/href="#\/([^"@]+)(?:@([^"\s]+))?"/g,(_,route,anchor)=>'href="'+base+route+'/'+(anchor?'#'+anchor:'')+'"');
 return <div className="imported-api" onClick={handleCodeCopy} dangerouslySetInnerHTML={{__html:html}}/>;
}
