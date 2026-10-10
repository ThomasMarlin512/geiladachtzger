import {Buffer} from 'node:buffer';
import {resolve4} from 'node:dns/promises';
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
export function parseHttpResponse(raw) {
 const split=raw.indexOf('\r\n\r\n');
 if(split<0||split>32768)throw Error('Ungültige Antwort der Webseite.');
 const head=raw.subarray(0,split).toString('utf8'),lines=head.split('\r\n');
 const status=Number(lines.shift().split(' ')[1]),headers={};
 for(const line of lines){const i=line.indexOf(':');if(i>0)headers[line.slice(0,i).toLowerCase()]=line.slice(i+1).trim();}
 if(status>=300&&status<400&&headers.location)return {redirect:headers.location};
 if(status!==200)throw Error('Die Webseite liefert kein nutzbares Ergebnis.');
 if(!/text\/html|application\/xhtml\+xml/i.test(headers['content-type']||''))throw Error('Dieser Link führt nicht auf eine HTML-Webseite.');
 if(headers['content-encoding']&&headers['content-encoding']!=='identity')throw Error('Diese Webseite liefert kein unterstütztes Vorschauformat.');
 let body=raw.subarray(split+4);
 if(/chunked/i.test(headers['transfer-encoding']||'')){
  const chunks=[];let at=0,done=false;
  while(at<body.length){const end=body.indexOf('\r\n',at);if(end<0)throw Error('Unvollständige Antwort.');
   const sizeText=body.subarray(at,end).toString().split(';')[0];if(!/^[0-9a-f]+$/i.test(sizeText))throw Error('Ungültige Antwort.');
   const size=parseInt(sizeText,16);at=end+2;if(size===0){done=true;break;}
   if(size>2_000_000||at+size+2>body.length)throw Error('Unvollständige Antwort.');
   chunks.push(body.subarray(at,at+size));at+=size;if(body.subarray(at,at+2).toString()!=='\r\n')throw Error('Ungültige Antwort.');at+=2;
  }
  if(!done)throw Error('Unvollständige Antwort.');body=Buffer.concat(chunks);
 }
 return {html:body.toString('utf8')};
}
export async function loadPage(value,remaining=3) {
 const url=publicUrl(value),addresses=await resolve4(url.hostname);
 if(!addresses.length||addresses.some(ip=>!publicIPv4(ip)))throw Error('Die Zieladresse ist nicht öffentlich erreichbar.');
 let connection,timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;try{connection?.close();}catch{}},10000);
 let response;
 try{
  // Connect to a validated IP, then authenticate TLS against the original hostname.
  connection=await Deno.connect({hostname:addresses[0],port:443});
  if(timedOut)throw Error('Die Webseite antwortet zu langsam.');
  connection=await Deno.startTls(connection,{hostname:url.hostname,alpnProtocols:['http/1.1']});
  const request=Buffer.from('GET '+url.pathname+url.search+' HTTP/1.1\r\nHost: '+url.host+'\r\nUser-Agent: Geiladachtzger-LinkPreview/1.0\r\nAccept: text/html,application/xhtml+xml\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n');
  let sent=0;while(sent<request.length)sent+=await connection.write(request.subarray(sent));
  const chunks=[];let size=0;const buffer=new Uint8Array(16384);
  while(true){const n=await connection.read(buffer);if(n===null)break;size+=n;if(size>2_050_000)throw Error('Die Webseite ist zu groß für eine Vorschau.');chunks.push(Buffer.from(buffer.subarray(0,n)));}
  response=parseHttpResponse(Buffer.concat(chunks));
 }finally{clearTimeout(timer);try{connection?.close();}catch{}}
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
