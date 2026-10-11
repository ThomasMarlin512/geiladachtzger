const wiredImages=new WeakSet();

// Retry the original image once if an optimized cover cannot be loaded.
export function wireImageFallbacks(root=document){
 for(const image of root.querySelectorAll('img[data-image-fallback],.event-card-photo,.trip-hero-photo,.hub-background,.album-destination-cover')){
  if(wiredImages.has(image))continue;
  wiredImages.add(image);
  const failed=()=>{
   const fallback=image.getAttribute('data-image-fallback');
   image.removeAttribute('data-image-fallback');
   if(fallback){
    try{
     const url=new URL(fallback,image.ownerDocument.baseURI);
     if(url.protocol==='https:'&&!url.username&&!url.password&&url.href!==image.src){
      image.removeAttribute('srcset');image.removeAttribute('sizes');
      image.hidden=false;image.src=url.href;return;
     }
    }catch{/* Keep the readable card when neither image is usable. */}
   }
   image.hidden=true;
  };
  image.addEventListener('error',failed);
  if(image.complete&&image.naturalWidth===0&&image.getAttribute('src'))failed();
 }
}
