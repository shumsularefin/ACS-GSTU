import {certificateTypes,signatories,certificateURL} from './certificate-model.js';
import {escapeHTML as h} from './content-model.js';
import qrcode from './vendor/qrcode.mjs';
import {parse} from './vendor/opentype.min.mjs';
const labelDate=s=>s?new Date(s+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'Not recorded';
const cached=new Map();
let formalResources;
async function formalCertificateSVG(c,{preview=false}={}){
 formalResources??=Promise.all([
  fetch('images/brand/certificate-formal.svg').then(r=>{if(!r.ok)throw Error('Formal certificate artwork unavailable');return r.text();}),
  ...['fonts/certificates/edwardian.ttf','fonts/certificates/alex-brush.ttf','fonts/original/original-2.ttf'].map(p=>fetch(p).then(r=>r.arrayBuffer()).then(parse))
 ]);
 const [template,nameFont,bodyFont,smallFont]=await formalResources;
 const center=582.41;
 function text(value,font,x,y,size,color='#524f4d',maxWidth=650){
  const valueText=String(value??'');size=Math.min(size,size*maxWidth/Math.max(1,font.getAdvanceWidth(valueText,size)));
  return `<path fill="${color}" d="${font.getPath(valueText,x-font.getAdvanceWidth(valueText,size)/2,y,size).toPathData(3)}"/>`;
 }
 function lines(value,size){
  const rows=[];let row='';
  for(const word of String(value).split(/\s+/)){if(bodyFont.getAdvanceWidth(row+' '+word,size)>610&&row){rows.push(row);row=word;}else row+=(row?' ':'')+word;}if(row)rows.push(row);return rows;
 }
 const citation=c.achievement||(certificateTypes[c.type]?.[1]||'In recognition of service to')+' '+c.event;
 let size=18.68,rows=lines(citation,size);while(rows.length>3&&size>10){size--;rows=lines(citation,size);}
 const qr=qrcode(0,'M');qr.addData(certificateURL(c.id,'https://acs-gstu.web.app'));qr.make();let dots='';const count=qr.getModuleCount(),cell=64/(count+8);
 for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col))dots+=`M${(col+4)*cell} ${(row+4)*cell}h${cell}v${cell}h-${cell}z`;
 const fields=text(c.name,nameFont,center,426.38,58.78,'#0b8036',650)
  +rows.map((row,i)=>text(row,bodyFont,center,455.43+i*22.41,size)).join('')
  +`<g transform="translate(550.41 518.5)"><rect width="64" height="64" fill="white"/><path d="${dots}" fill="#101b23"/></g>`
  +text('Credential ID: '+c.id,smallFont,center,601.49,8,'#252525',290)
  +text('Issued '+labelDate(c.dateIssued),smallFont,center,615,7,'#524f4d',280)
  +(preview?text('SAMPLE — NOT ISSUED',smallFont,center,630,7,'#524f4d',280):'');
 return template.replace('<!--CERTIFICATE_FIELDS-->',fields).replace('<svg ','<svg role="img" aria-label="'+h('Certificate for '+c.name)+'" ');
}
function dataURL(path){if(!cached.has(path))cached.set(path,fetch(path).then(r=>{if(!r.ok)throw Error('Certificate asset unavailable');return path.endsWith('.svg')?r.text().then(s=>new Blob([s],{type:'image/svg+xml'})):r.blob();}).then(b=>new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.readAsDataURL(b);})));return cached.get(path);}
let fontsPromise;
function fonts(){return fontsPromise??=Promise.all(['original-2.ttf','original-3.ttf'].map(f=>fetch('fonts/original/'+f).then(r=>r.arrayBuffer()).then(parse)));}
export async function certificateSVG(c,{preview=false}={}){
 if(['instructor','teacher','institution','organization','guest','delegate','executive'].includes(c.type))return formalCertificateSVG(c,{preview});
 const award=['champion','runner-up','second-runner-up'].includes(c.type),awardName=({champion:'Champion','runner-up':'First Runner-up','second-runner-up':'Second Runner-up'})[c.type];
 const [[regular,bold],chapter,gstu,advisor,coadvisor,texture]=await Promise.all([fonts(),...['chapter-lockup-white','gstu-logo','advisor-signature','coadvisor-signature'].map(n=>dataURL('images/brand/'+n+'.png')),dataURL('images/brand/texture.svg')]);
 const ink='#202c4c',blue='#323fa0',teal=({champion:'#a7791b','runner-up':'#697c95','second-runner-up':'#a76d45'})[c.type]||'#64ccc9',type=certificateTypes[c.type]||certificateTypes.participant;
 function t(value,x,y,size=16,color=ink,weight=400,align='start'){
  const font=weight>=600?bold:regular;const width=font.getAdvanceWidth(String(value),size);if(align==='middle')x-=width/2;if(align==='end')x-=width;
  return `<path fill="${color}" d="${font.getPath(String(value),x,y,size).commands.map(c=>c.type+({M:['x','y'],L:['x','y'],Q:['x1','y1','x','y'],C:['x1','y1','x2','y2','x','y'],Z:[]}[c.type]||[]).map(k=>Number(c[k].toFixed(3))).join(' ')).join(' ')}"/>`;
 }
 function wrap(value,width,size,font){const rows=[];let row='';for(const word of String(value).split(/\s+/)){if(font.getAdvanceWidth((row?row+' ':'')+word,size)<=width){row+=(row?' ':'')+word;continue;}if(row)rows.push(row);row='';for(const char of word){if(font.getAdvanceWidth(row+char,size)>width){rows.push(row);row='';}row+=char;}}if(row)rows.push(row);return rows;}
 function block(value,x,y,width,maxHeight,size=24,weight=400,color=ink){const font=weight>=600?bold:regular;let rows=wrap(value,width,size,font);while(rows.length*size*1.35>maxHeight&&size>9){size-=1;rows=wrap(value,width,size,font);}return rows.map((r,i)=>t(r,x,y+i*size*1.35,size,color,weight)).join('');}
 const qr=qrcode(0,'M');qr.addData(certificateURL(c.id,'https://acs-gstu.web.app'));qr.make();const count=qr.getModuleCount(),cell=96/(count+8);let dots='';for(let r=0;r<count;r++)for(let col=0;col<count;col++)if(qr.isDark(r,col))dots+=`M${(col+4)*cell} ${(r+4)*cell}h${cell}v${cell}h-${cell}z`;
 const idLines=c.id.match(/.{1,22}/g)||[''];
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 1200 850" role="img" aria-label="${h(type[0]+' certificate for '+c.name)}"><title>${h(c.name+' — '+c.event+' — '+c.id)}</title><defs><linearGradient id="acsHeader"><stop stop-color="#406bb0"/><stop offset="1" stop-color="#303a95"/></linearGradient><linearGradient id="acsPanel" x2="1" y2="1"><stop stop-color="#e2f6f4"/><stop offset="1" stop-color="#f2f6fe"/></linearGradient></defs><rect width="1200" height="850" fill="white"/><image href="${texture}" x="0" y="179" width="1200" height="634" preserveAspectRatio="xMidYMid slice" opacity=".27"/><rect width="1200" height="173" fill="url(#acsHeader)"/><path d="M670 173L870 0H1200L1000 173Z" fill="#5668bc" opacity=".22"/><image href="${chapter}" x="60" y="40" width="360" height="99"/><rect x="1059.5" y="34.5" width="91" height="99" fill="white" stroke="white" stroke-width="3"/><image href="${gstu}" x="1061" y="36" width="88" height="96" preserveAspectRatio="none"/><rect y="173" width="1200" height="6" fill="${teal}"/>${t(award?'EXCELLENCE · ACHIEVEMENT · DISTINCTION':'CHEMISTRY · COMMUNITY · IMPACT',60,224,12,blue,600)}${t('Certificate',58,283,51,blue,600)}${t('of '+type[0],60,320,25,blue)}<rect x="60" y="342" width="72" height="5" fill="${teal}"/>${t('Presented to',60,384,15,'#55627b')}${block(c.name,58,434,720,90,42,600)}${award?`<rect x="60" y="478" width="245" height="40" rx="2" fill="${teal}"/>${t(awardName,182.5,505,17,'white',600,'middle')}`:t(type[1],60,511,15)}${block(c.event,60,545,720,78,23,600,blue)}${block(c.achievement||'Organized by ACS Student Chapter, Gopalganj Science and Technology University.',60,622,710,40,13)}${t('Event date: '+labelDate(c.eventDate||c.dateIssued),60,662,12,'#55627b')}<path d="M865 179V523L1004 651L1143 523V179" fill="white" fill-opacity=".92" stroke="${award?teal:blue}" stroke-width="2"/>${t(preview?'Certificate':'Verified',904,248,21,blue,600)}${t(preview?'preview':'Certificate',904,277,21,blue,600)}<rect x="910" y="305" width="188" height="188" fill="white"/><g transform="translate(916 311) scale(1.833333)"><rect width="96" height="96" fill="white"/><path d="${dots}" fill="#172440"/></g>${t('Scan to verify',1004,520,14,ink,600,'middle')}${t('Issued '+labelDate(c.dateIssued),1004,545,12,ink,400,'middle')}${idLines.map((line,i)=>t(line,1004,570+i*13,8,blue,400,'middle')).join('')}${signatories.map((s,i)=>{const x=60+i*540;return `<image href="${i?coadvisor:advisor}" x="${x+25}" y="681" width="155" height="48"/><line x1="${x}" y1="730" x2="${x+455}" y2="730" stroke="#cad5e8"/>${t(s.name,x,752,17,ink,600)}${t(s.role+', ACS Student Chapter, GSTU',x,776,12,blue)}${t(s.title,x,797,11,'#55627b')}`;}).join('')}<rect y="813" width="1200" height="37" fill="${blue}"/>${t(preview?'SAMPLE — NOT ISSUED':'Digitally issued by ACS Student Chapter, GSTU',60,837,10,'white',600)}${t('Gopalganj-8100, Bangladesh · acs-gstu.web.app',1115,837,10,'white',400,'end')}</svg>`;
}
export async function downloadCertificate(c,{preview=false}={}){
 const svg=await certificateSVG(c,{preview}),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{
  const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1700;canvas.getContext('2d').drawImage(img,0,0,2400,1700);
  if(!window.PDFLib)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='js/vendor/pdf-lib.min.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
  const pdf=await PDFLib.PDFDocument.create(),page=pdf.addPage([841.89,596.34]);const image=await pdf.embedPng(canvas.toDataURL('image/png'));page.drawImage(image,{x:0,y:0,width:841.89,height:596.34});
  pdf.setTitle(`${preview?'Sample - ':''}${c.name} - ${c.event}`);pdf.setAuthor('ACS Student Chapter, GSTU');
  const link=pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[40,0,790,42],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFLib.PDFString.of(certificateURL(c.id,'https://acs-gstu.web.app'))}});page.node.set(PDFLib.PDFName.of('Annots'),pdf.context.obj([pdf.context.register(link)]));
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([await pdf.save()],{type:'application/pdf'}));a.download=`${preview?'SAMPLE-':''}${c.id}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 }finally{URL.revokeObjectURL(url);}
}


