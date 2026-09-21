import test from 'node:test';
import assert from 'node:assert/strict';
import {readDraft,withSupportedImageAttributes} from '../lib/draft-data.ts';
import {preparePublishedDocument} from '../lib/image-assets.ts';
import {withoutEditorMetadata} from '../lib/editor-metadata.ts';
import fs from 'node:fs';

test('legacy image fields are ignored recursively, without mutating image or carousel data',async()=>{
  const image={type:'image',attrs:{src:'https://example.com/a.png',imageId:'stable',alt:'Alt',width:65,align:'right',caption:'Caption',scriptNote:'retired-value'}};
  const draft={id:'page',title:'Title',content:{type:'doc',content:[image,{type:'carousel',content:[image]}]},baseHtml:'',updated:'now',commit:'current',notesCommit:'old',publishedImageIds:['stable'],discardedAt:'yesterday'};
  const clean=readDraft(draft);
  assert.equal(clean.commit,'current');
  assert.equal(clean.notesCommit,undefined);
  assert(!JSON.stringify(clean).includes('retired-value'));
  assert.equal(clean.content.content[1].content[0].attrs.caption,'Caption');
  assert.equal(clean.content.content[0].attrs.width,65);
  assert.equal(clean.content.content[0].attrs.align,'right');
  assert.equal(draft.content.content[0].attrs.scriptNote,'retired-value');
  assert(!JSON.stringify((await preparePublishedDocument(draft.content)).doc).includes('retired-value'));
  assert(!JSON.stringify(withoutEditorMetadata({oldPage:draft})).includes('retired-value'));
});
test('image UI and schema contain no retired field or its copy button',()=>{
  const app=fs.readFileSync(new URL('../app/editor-app.tsx',import.meta.url),'utf8');
  const schema=fs.readFileSync(new URL('../app/editor-extensions.tsx',import.meta.url),'utf8');
  assert(!/scriptNote|Скрипт \/ заметка|Скопировать всё|Copy all/.test(app+schema));
});

test('image schema retains supported attributes and ignores arbitrary extra attributes',()=>{
  const attrs={src:'image.png',alt:'Alternative',title:'Title',width:65,height:320,imageId:'stable',caption:'Caption',assetPath:'assets/image.png',align:'right'};
  const source={type:'doc',content:[{type:'paragraph',attrs:{textAlign:'center'},content:[{type:'text',text:'Text',marks:[{type:'link',attrs:{href:'/help',target:'_blank'}}]}]},{type:'carousel',attrs:{id:'slides'},content:[{type:'image',attrs:{...attrs,unknownAttribute:'ignored'}}]}]};
  const clean=withSupportedImageAttributes(source);
  assert.deepEqual(clean.content[0],source.content[0]);
  assert.deepEqual(clean.content[1].attrs,{id:'slides'});
  assert.deepEqual(clean.content[1].content[0].attrs,attrs);
  assert.equal(source.content[1].content[0].attrs.unknownAttribute,'ignored');
  const published=withoutEditorMetadata(source);
  const {assetPath,...publicAttrs}=attrs;
  assert.deepEqual(published.content[1].content[0].attrs,publicAttrs);
});
