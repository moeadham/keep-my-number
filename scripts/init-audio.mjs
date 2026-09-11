import fs from 'node:fs';
if(!fs.existsSync('src/audio.json'))fs.writeFileSync('src/audio.json','{}\n');
