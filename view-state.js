export function replaceKeepingOpenDetails(container,html,attribute='data-date-detail'){
 const opened=new Set([...container.querySelectorAll('details[open]['+attribute+']')].map(node=>node.getAttribute(attribute)));
 container.innerHTML=html;
 for(const node of container.querySelectorAll('details['+attribute+']'))node.open=opened.has(node.getAttribute(attribute));
}
