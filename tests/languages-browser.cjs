const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require(path.join(process.env.PLAYWRIGHT_ROOT,'node_modules/playwright'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173'],{stdio:'inherit'});
 let browser;
 try{
  const base='http://127.0.0.1:4173/documentation_editor_CloudPayments/';
  for(let n=0;n<100;n++){try{if((await fetch(base)).ok)break;}catch{}await delay(200);}
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1468,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'#tech/api');
  const title=page.getByRole('textbox',{name:'Название страницы H1'});
  await title.fill('Русская проверка');
  await page.locator('[contenteditable="true"]').first().fill('Русский текст остаётся отдельно.');
  await page.getByRole('button',{name:'Английская версия',exact:true}).click();
  await page.getByText('EN · Английская версия',{exact:true}).waitFor();
  assert.equal(await title.inputValue(),'Русская проверка');
  await title.fill('English manual version');
  await page.locator('[contenteditable="true"]').first().fill('Manually authored English content.');
  await page.getByRole('button',{name:'Русская версия',exact:true}).click();
  await page.getByText('RU · Русская версия',{exact:true}).waitFor();
  assert.equal(await title.inputValue(),'Русская проверка');
  assert.ok((await page.locator('[contenteditable="true"]').first().innerText()).includes('Русский текст'));
  await page.getByRole('button',{name:'Английская версия',exact:true}).click();
  await page.getByText('EN · Английская версия',{exact:true}).waitFor();
  assert.equal(await title.inputValue(),'English manual version');
  assert.ok((await page.locator('[contenteditable="true"]').first().innerText()).includes('Manually authored English'));
  await page.reload();
  await page.getByText('EN · Английская версия',{exact:true}).waitFor();
  assert.equal(await title.inputValue(),'English manual version');
  fs.mkdirSync('test-artifacts',{recursive:true});
  await page.screenshot({path:'test-artifacts/english-editor.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Настройки',exact:true}).click();
  await page.getByRole('button',{name:'Русская версия',exact:true}).last().waitFor();
  await page.screenshot({path:'test-artifacts/english-editor-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Browser verified: private Russian and English drafts, reload recovery, full editor and mobile page settings.');
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
