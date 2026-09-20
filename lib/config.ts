// Public site location and routing are deployment settings, shared by all UI actions.
const env=(import.meta as ImportMeta & {env?:Record<string,string>}).env;
export const DOCS_URL=env?.VITE_DOCS_URL||'https://novmar03.github.io/CloudPayments_documentation/';
export const DOCS_ROUTING=env?.VITE_DOCS_ROUTING==='path'?'path':'hash';
export const EDITOR_REPO='novmar03/documentation_editor_CloudPayments';
export const DOCS_REPO='novmar03/CloudPayments_documentation';
