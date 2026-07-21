// index.ts/

import { createClient } from "./apis/client.js";
import {
  config,
  esEntities,
  getEsConfig,
  saveEsConfig,
  createEsEntities,
  getIndexPrefix,
  setIndexPrefix,
} from "./apis/client.js";

export { config,createClient, esEntities, getEsConfig, saveEsConfig, createEsEntities, getIndexPrefix, setIndexPrefix };
/*
 *
 *

const client = createClient(config);

console.log({'client':client,'config':config});

 

*
*
*/
