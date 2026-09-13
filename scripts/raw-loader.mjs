import {readFile} from 'node:fs/promises';

// Mirror Vite's ?raw imports for the Node test runner.
export async function load(url, context, nextLoad) {
  if (url.endsWith('?raw')) {
    const file = new URL(url);
    file.search = '';
    return {format:'module', shortCircuit:true, source:'export default ' + JSON.stringify(await readFile(file, 'utf8'))};
  }
  return nextLoad(url, context);
}
