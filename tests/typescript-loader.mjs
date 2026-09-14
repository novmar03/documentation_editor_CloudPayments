import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

registerHooks({
  resolve(specifier,context,nextResolve) {
    if(specifier.startsWith('.')&&context.parentURL){
      const url=new URL(specifier+'.ts',context.parentURL);
      if(existsSync(url))return nextResolve(url.href,context);
    }
    return nextResolve(specifier,context);
  },
  load(url,context,nextLoad) {
    if(url.endsWith('.ts'))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};
    return nextLoad(url,context);
  }
});
