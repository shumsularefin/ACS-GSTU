const cache=new Map();
let config;
export async function resolveImage(value){
 if(!value?.startsWith('media:'))return value;
 if(!/^media:[a-f0-9-]{36}$/.test(value))throw Error('Invalid image reference');
 if(!cache.has(value))cache.set(value,(async()=>{config??=await fetch('data/site-config.json').then(r=>r.json());const response=await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.firebase.projectId)}/databases/(default)/documents/siteImages/${value.slice(6)}`);if(!response.ok)throw Error('Image unavailable');const doc=await response.json(),src=doc.fields?.image?.stringValue;if(!/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src))throw Error('Invalid image');return src;})().catch(error=>{cache.delete(value);throw error;}));
 return cache.get(value);
}
function images(){for(const img of document.querySelectorAll('img[data-media]:not([data-loading-media])')){img.dataset.loadingMedia='true';resolveImage(img.dataset.media).then(src=>{img.src=src;img.removeAttribute('data-media');}).catch(()=>{img.alt+=' (image unavailable)';});}}
if(typeof document!=='undefined'){images();new MutationObserver(images).observe(document.body,{childList:true,subtree:true});}
export async function prepareImage(file){if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a JPG, PNG or WebP image up to 10 MB.');const bitmap=await createImageBitmap(file);const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();let data;for(const quality of [.82,.68,.5,.35]){data=canvas.toDataURL('image/jpeg',quality);if(data.length<=280000)return data;}throw Error('This image is too detailed. Please crop it or choose a smaller image.');}
