import {Buffer} from 'node:buffer';
import {resolve4} from 'node:dns/promises';
import {request} from 'node:https';
export function publicUrl(value,base) {
 const u=new URL(value,base);
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||u.href.length>2048)throw Error('Nur öffentliche HTTPS-Links ohne Zugangsdaten sind möglich.');
 const host=u.hostname.toLowerCase();
 if(!host.includes('.')||host.endsWith('.')||/^[\d.]+$/.test(host)||host.includes(':')||/\.(localhost|local|internal|test|invalid|example)$/.test(host))throw Error('Dieser Link ist nicht öffentlich erreichbar.');
 return u;
}
export function publicIPv4(ip) {
 const p=ip.split('.').map(Number);
 if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
 const [a,b,c]=p;
 return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
export async function loadPage(value,remaining=3) {
 const url=publicUrl(value),addresses=await resolve4(url.hostname);
 if(!addresses.length||addresses.some(ip=>!publicIPv4(ip)))throw Error('Die Zieladresse ist nicht öffentlich erreichbar.');
 // Pin the validated address; keep the original hostname for TLS and Host.
 const response=await new Promise((resolve,reject)=>{
  const req=request(url,{method:'GET',agent:false,family:4,lookup:(_h,_o,cb)=>cb(null,addresses[0],4),
   headers:{'User-Agent':'Geiladachtzger-LinkPreview/1.0','Accept':'text/html,application/xhtml+xml','Accept-Encoding':'identity'}},res=>{
   if(res.statusCode>=300&&res.statusCode<400){res.resume();resolve({redirect:res.headers.location});return;}
   if(res.statusCode!==200){res.resume();reject(Error('Die Webseite liefert kein nutzbares Ergebnis.'));return;}
   if(!/text\/html|application\/xhtml\+xml/.test(res.headers['content-type']||'')){res.resume();reject(Error('Dieser Link führt nicht auf eine HTML-Webseite.'));return;}
   let size=0;const chunks=[];
   res.on('data',chunk=>{size+=chunk.length;if(size>2_000_000){req.destroy(Error('Die Webseite ist zu groß für eine Vorschau.'));return;}chunks.push(chunk);});
   res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);
  });
  req.on('error',reject);req.setTimeout(8000,()=>req.destroy(Error('Die Webseite antwortet zu langsam.')));
  const timer=setTimeout(()=>req.destroy(Error('Zeitüberschreitung beim Laden.')),10000);
  req.on('close',()=>clearTimeout(timer));req.end();
 });
 if(response.redirect){if(!remaining)throw Error('Zu viele Weiterleitungen.');return loadPage(publicUrl(response.redirect,url).href,remaining-1);}
 return {html:response.html,url:url.href};
}
function decode(s='') {return s.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi,(full,key)=>{
 const named={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'};if(named[key.toLowerCase()])return named[key.toLowerCase()];
 const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
});}
function attrs(tag){const a={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))a[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);return a;}
export function extractImages(html,url) {
 const images=[];let title='';
 const add=(value,kind)=>{try{const u=publicUrl(value,url);if(!images.some(i=>i.url===u.href)&&images.length<8)images.push({url:u.href,kind});}catch{}};
 for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const a=attrs(tag),key=(a.property||a.name||'').toLowerCase();if(['og:image','og:image:url','og:image:secure_url','twitter:image','twitter:image:src'].includes(key)&&a.content)add(a.content,'Vorschaubild');if(key==='og:title')title=a.content||'';}
 for(const tag of html.match(/<img\b[^>]*>/gi)||[]){const a=attrs(tag);if((a.width&&parseInt(a.width)<160)||(a.height&&parseInt(a.height)<90))continue;const src=a.src||a['data-src'];if(src&&!/logo|icon|pixel|spacer|\.svg(?:\?|$)/i.test(src))add(src,'Foto der Webseite');}
 return {title:title.slice(0,200),source_url:url,images};
}
