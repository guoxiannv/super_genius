import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {registryRoot} from './registry.mjs';
export async function registeredApps(){const {apps}=JSON.parse(await readFile(resolve(registryRoot,'config/apps.json'),'utf8'));return apps.map(a=>({...a,root:resolve(registryRoot,a.root)}));}
