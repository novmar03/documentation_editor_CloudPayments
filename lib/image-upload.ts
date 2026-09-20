import {toBase64,type Repository} from './repository';

export function validateImageFile(file:File){
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('Выберите PNG, JPG, WebP или GIF');
  if(file.size>5*1024*1024)throw new Error('Максимальный размер изображения — 5 МБ');
}
export async function uploadEditorImage(file:File,repository:Repository|null){
  validateImageFile(file);
  return repository?repository.upload(file):{src:`data:${file.type};base64,${toBase64(new Uint8Array(await file.arrayBuffer()))}`,alt:file.name};
}
