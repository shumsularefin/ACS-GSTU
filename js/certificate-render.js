import {certificateTypes,signatories,certificateURL} from './certificate-model.js';
import {escapeHTML as h} from './content-model.js';
import qrcode from './vendor/qrcode.mjs';
import {parse} from './vendor/opentype.min.mjs';

const cached=new Map();
function dataURL(path){
 if(!cached.has(path))cached.set(path,fetch(path).then(r=>{if(!r.ok)throw Error('Certificate asset unavailable: '+path);return path.endsWith('.svg')?r.text().then(s=>new Blob([s],{type:'image/svg+xml'})):r.blob();}).then(b=>new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.readAsDataURL(b);})));
 return cached.get(path);
}
let fontsPromise;
function fonts(){return fontsPromise??=Promise.all(['original-2.ttf','original-3.ttf','original-0.ttf'].map(f=>fetch('fonts/original/'+f).then(r=>r.arrayBuffer()).then(parse)));}
const date=s=>s?new Date(s+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'Not recorded';

export async function certificateSVG(c,{preview=false}={}){
 const [[regular,bold,script],chapter,gstu,advisor,coadvisor,texture,championArt,formalArt]=await Promise.all([
  fonts(),...['chapter-lockup-white','gstu-logo','advisor-signature','coadvisor-signature'].map(n=>dataURL('images/brand/'+n+'.png')),
  dataURL('images/brand/texture.svg'),dataURL('images/brand/certificate-champion-art.png'),dataURL('images/brand/certificate-formal-art.png')
 ]);
 const dark='#153351',blue='#135da1',navy='#13385e',gold='#ffcf3b';
 const award=['champion','runner-up','second-runner-up'].includes(c.type);
 const formal=['instructor','teacher','institution','organization','guest','delegate','executive'].includes(c.type);
 const accent=({'champion':'#ffcf3b','runner-up':'#aebcca','second-runner-up':'#c98e64'})[c.type]||gold;
 const awardName=({'champion':'CHAMPION','runner-up':'FIRST RUNNER-UP','second-runner-up':'SECOND RUNNER-UP'})[c.type];
 const category=certificateTypes[c.type]||certificateTypes.participant;
 function pathText(value,x,y,size=18,color=dark,weight=400,align='start',face){
  const f=face|| (weight>=600?bold:regular),string=String(value??'');
  const width=f.getAdvanceWidth(string,size);if(align==='middle')x-=width/2;if(align==='end')x-=width;
  const d=f.getPath(string,x,y,size).commands.map(cmd=>cmd.type+({M:['x','y'],L:['x','y'],Q:['x1','y1','x','y'],C:['x1','y1','x2','y2','x','y'],Z:[]}[cmd.type]||[]).map(k=>Number(cmd[k].toFixed(3))).join(' ')).join(' ');
  return `<path fill="${color}" d="${d}"/>`;
 }
 function fitted(value,x,y,maxWidth,size=22,color=dark,weight=400,align='middle',face){
  const f=face||(weight>=600?bold:regular);while(f.getAdvanceWidth(String(value),size)>maxWidth&&size>12)size--;
  return pathText(value,x,y,size,color,weight,align,f);
 }
 function wrapped(value,x,y,width,size=18,color=dark,weight=400,line=26,maxLines=3){
  const f=weight>=600?bold:regular,words=String(value??'').split(/\s+/),rows=[];let row='';
  for(const word of words){if(f.getAdvanceWidth((row?row+' ':'')+word,size)>width&&row){rows.push(row);row=word;}else row+=(row?' ':'')+word;}
  if(row)rows.push(row);
  return rows.slice(0,maxLines).map((r,i)=>fitted(r,x,y+i*line,width,size,color,weight)).join('');
 }
 const qr=qrcode(0,'M');qr.addData(certificateURL(c.id,'https://acs-gstu.web.app'));qr.make();
 const count=qr.getModuleCount(),cell=96/(count+8);let dots='';
 for(let r=0;r<count;r++)for(let col=0;col<count;col++)if(qr.isDark(r,col))dots+=`M${(col+4)*cell} ${(r+4)*cell}h${cell}v${cell}h-${cell}z`;
 const qrAt=(x,y,scale=1)=>`<g transform="translate(${x} ${y}) scale(${scale})"><rect width="96" height="96" fill="white"/><path d="${dots}" fill="#172a3c"/></g>`;
 const mark=preview?pathText('SAMPLE — NOT ISSUED',50,828,11,navy,600):'';
 const signature=(x,index,y=690)=>{
  const s=signatories[index],img=index?coadvisor:advisor;
  return `<image href="${img}" x="${x-94}" y="${y-62}" width="188" height="62" preserveAspectRatio="xMidYMid meet"/><line x1="${x-170}" x2="${x+170}" y1="${y}" y2="${y}" stroke="${navy}" stroke-width="1"/>${fitted(s.name,x,y+23,340,18,dark,600)}${fitted(s.role+', ACS Student Chapter, GSTU',x,y+49,345,13,dark)}${fitted(s.title,x,y+70,345,12,dark)}`;
 };
 const base=`<rect width="1200" height="850" fill="#fff"/><image href="${texture}" width="1200" height="850" preserveAspectRatio="xMidYMid slice" opacity=".25"/>`;
 const head=`<title>${h(c.name+' — '+c.event+' — '+c.id)}</title><defs><clipPath id="champArt"><rect x="99" y="0" width="244" height="239"/></clipPath><clipPath id="formalCorners"><path d="M0 0H275V110H82V254H0ZM925 0H1200V254H1118V110H925ZM0 595H78V850H0ZM0 785H155V850H0ZM1122 595H1200V850H1122ZM1045 805H1200V850H1045Z"/></clipPath><clipPath id="formalLogo"><rect x="390" y="226" width="422" height="105"/></clipPath></defs>`;
 let content;
 if(award){
  content=`${base}<rect x="0" width="1200" height="850" fill="none" stroke="${navy}" stroke-width="30"/><rect x="17" y="17" width="1166" height="816" fill="none" stroke="${blue}" stroke-opacity=".15"/><image href="${championArt}" width="1200" height="850" clip-path="url(#champArt)"/><path d="M220 242V697" fill="none" stroke="${blue}" stroke-width="2" stroke-dasharray="7 6"/><path d="M211 695L220 680L229 695" fill="none" stroke="${blue}" stroke-width="5" stroke-linecap="round"/><circle cx="220" cy="475" r="85" fill="#f7fbfd" stroke="${blue}" stroke-width="2"/><circle cx="220" cy="475" r="78" fill="none" stroke="${navy}" stroke-width="3" stroke-dasharray="2 5"/>${qrAt(172,427)}${fitted('Credential ID: '+c.id,220,797,360,12,dark)}${pathText('C E R T I F I C A T E',845,210,73,blue,600,'middle')}${pathText('O F   A P P R E C I A T I O N',845,250,28,dark,400,'middle')}${pathText('THIS CERTIFICATE IS PROUDLY PRESENTED TO',845,309,16,dark,400,'middle')}${fitted(c.name,845,405,620,68,blue,400,'middle',script)}<rect x="796" y="445" width="350" height="54" fill="${accent}"/>${fitted(awardName,971,484,332,31,dark,600)}${wrapped('in '+c.event,846,535,690,20,dark,600,29,2)}${wrapped(c.achievement||'Presented by ACS Student Chapter, GSTU in recognition of outstanding achievement.',846,590,700,16,dark,400,25,2)}${fitted('Date: '+date(c.eventDate||c.dateIssued),845,639,600,16,dark)}${signature(465,0,694)}${signature(960,1,694)}${preview?pathText('SAMPLE — NOT ISSUED',52,812,11,navy,600):''}`;
 }else if(formal){
  content=`${base}<rect x="18" y="18" width="1164" height="814" fill="none" stroke="#777" stroke-width="1"/><image href="${formalArt}" width="1200" height="850" clip-path="url(#formalCorners)"/><image href="${formalArt}" width="1200" height="850" clip-path="url(#formalLogo)"/><text x="600" y="187" font-family="Georgia,serif" font-size="68" text-anchor="middle" fill="#444" textLength="850" lengthAdjust="spacingAndGlyphs">Certificate of Appreciation</text>${pathText('This certificate is presented for',600,377,27,'#555',400,'middle',script)}${fitted(c.name,600,485,820,75,'#007a41',400,'middle',script)}${wrapped(c.achievement||category[1]+' '+c.event,600,544,930,19,'#454545',400,30,3)}${fitted('Date: '+date(c.eventDate||c.dateIssued),600,618,650,14,dark)}${signature(292,0,682)}${signature(908,1,682)}${qrAt(557,677,0.9)}${fitted('Credential ID: '+c.id,600,784,345,12,dark)}${preview?pathText('SAMPLE — NOT ISSUED',52,816,11,navy,600):''}`;
 }else{
  content=`${base}<path d="M0 0H1200V28H0Z" fill="${navy}"/><path d="M0 0H214L0 214ZM1200 0H986L1200 214Z" fill="${gold}"/><path d="M0 0H170L0 170ZM1200 0H1030L1200 170Z" fill="${blue}"/><path d="M0 0H126L0 126ZM1200 0H1074L1200 126Z" fill="${navy}"/><path d="M0 214L17 231V833H1183V231L1200 214V850H0Z" fill="${navy}"/><rect x="210" y="36" width="780" height="17" fill="${gold}"/>${pathText('CERTIFICATE',600,208,92,navy,400,'middle')}${pathText('OF PARTICIPATION',600,266,37,'#202834',400,'middle')}${pathText('THIS CERTIFICATE IS PROUDLY PRESENTED TO',600,315,18,'#202834',400,'middle')}${fitted(c.name,600,425,890,78,blue,400,'middle',script)}<line x1="235" x2="965" y1="441" y2="441" stroke="${navy}" stroke-width="1" stroke-dasharray="2 6"/>${wrapped('Has successfully participated in '+c.event,600,480,870,19,'#202834',400,29,2)}${wrapped(c.achievement||'Organized by ACS Student Chapter, GSTU.',600,544,930,18,'#202834',400,27,2)}${fitted('Date: '+date(c.eventDate||c.dateIssued),600,604,840,15,'#202834')}${signature(300,0,693)}${signature(905,1,693)}${qrAt(548,654,1.08)}${fitted('Credential ID: '+c.id,600,782,330,12,dark)}${preview?pathText('SAMPLE — NOT ISSUED',53,814,11,navy,600):''}<path d="M0 833H1200V850H0Z" fill="${navy}"/>`;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 1200 850" role="img" aria-label="${h(category[0]+' certificate for '+c.name)}">${head}${content}</svg>`;
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
