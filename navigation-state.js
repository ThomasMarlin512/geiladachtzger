// Mark the section currently visible below the sticky navigation.
// Page tabs use aria-current="page"; scrolling sections use "location".
(() => {
 function chooseSection(sections,line,viewportHeight,atBottom,hash){
  const visible=sections.filter(s=>s.bottom>line&&s.top<viewportHeight);
  if(atBottom&&visible.length)return [...visible].sort((a,b)=>b.top-a.top)[0];
  const current=visible.filter(s=>s.top<=line).sort((a,b)=>b.top-a.top||(b.id===hash)-(a.id===hash));
  if(current.length)return current[0];
  return visible.filter(s=>s.top-line<=64).sort((a,b)=>a.top-b.top)[0]||null;
 }
 document.querySelectorAll('[data-scroll-navigation]').forEach(nav=>{
  const links=[...nav.querySelectorAll('[data-nav-section]')];
  const sections=links.flatMap(link=>link.dataset.navSection.split(/\s+/).map(id=>({id,link,element:document.getElementById(id)}))).filter(s=>s.element);
  let queued=false;
  function update(){
   queued=false;
   const line=Math.max(0,nav.getBoundingClientRect().bottom)+64;
   const visible=nav.getClientRects().length?sections.filter(s=>s.element.getClientRects().length).map(s=>(()=>{const rect=s.element.getBoundingClientRect();return {...s,top:rect.top,bottom:rect.bottom};})()):[];
   const atBottom=scrollY>0&&scrollY+innerHeight>=document.documentElement.scrollHeight-4;
   const active=chooseSection(visible,line,innerHeight,atBottom,location.hash.slice(1))?.link;
   links.forEach(link=>{
    if(link===active){if(link.getAttribute('aria-current')!=='location')link.setAttribute('aria-current','location');}
    else if(link.hasAttribute('aria-current'))link.removeAttribute('aria-current');
   });
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(update);}}
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);
  addEventListener('hashchange',schedule);addEventListener('pageshow',schedule);addEventListener('load',schedule);
  if(typeof ResizeObserver!=='undefined'){
   const observer=new ResizeObserver(schedule);observer.observe(document.body);observer.observe(nav);
   sections.forEach(s=>observer.observe(s.element));
  }
  new MutationObserver(schedule).observe(document.body,{attributes:true,subtree:true,attributeFilter:['hidden','open']});
  schedule();
 });
})();
