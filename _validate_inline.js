const fs=require('fs');
const html=fs.readFileSync("/mnt/data/bullet_echo_noir_v61/index.html",'utf8');
const m=html.match(/<script>\n\(\(\) => \{([\s\S]*)\}\)\(\);\n<\/script>/);
if(!m) throw new Error('script not found');
new Function(m[1]);
console.log('JS parse ok');
