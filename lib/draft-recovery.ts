import type {Draft} from './repository';

/** Recover content and its original baseline together; never silently rebase edits. */
export function selectRecovery(cached:Draft|null,remote:Draft|null,forceRemote=false):Draft|null{
  return !forceRemote&&cached&&(!remote||cached.updated>remote.updated)?{...cached}:null;
}
