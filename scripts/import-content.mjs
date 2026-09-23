import fs from 'node:fs';
import {normalizeContent,publicContent} from '../js/content-model.js';
const input=process.argv[2];if(!input)throw Error('Usage: npm run import-content -- path/to/acs-content.json');
const data=publicContent(normalizeContent(JSON.parse(fs.readFileSync(input,'utf8'))));
fs.mkdirSync('data/backups',{recursive:true});
const stamp=Date.now();
for(const key of ['events','team','membership']){fs.copyFileSync(`data/${key}.json`,`data/backups/${key}-${stamp}.json`);fs.writeFileSync(`data/${key}.json`,JSON.stringify(data[key],null,2)+'\n');}
console.log('Content imported. Run the image optimizer if needed, then npm run build and npm test.');
