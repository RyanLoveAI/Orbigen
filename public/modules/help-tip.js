const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function helpTip(label,text){return `<button type="button" class="help-question" aria-label="${esc(label)}" data-help="${esc(text)}">?</button>`;}
let installed=false,tooltip,owner,timer;
function hide(){clearTimeout(timer);owner?.removeAttribute('aria-describedby');owner=null;if(tooltip)tooltip.hidden=true;}
function show(button){
 clearTimeout(timer);owner?.removeAttribute('aria-describedby');owner=button;
 tooltip.textContent=button.dataset.help;tooltip.hidden=false;button.setAttribute('aria-describedby',tooltip.id);
 const r=button.getBoundingClientRect();tooltip.style.left='12px';tooltip.style.top='12px';
 const box=tooltip.getBoundingClientRect(),width=document.documentElement.clientWidth,height=document.documentElement.clientHeight,left=Math.max(12,Math.min(r.left,width-box.width-12)),below=r.bottom+8;
 tooltip.style.left=left+'px';tooltip.style.top=(below+box.height<=height-12?below:Math.max(12,Math.min(r.top-box.height-8,height-box.height-12)))+'px';
}
export function bindHelpTips(){
 hide();if(installed)return;installed=true;
 tooltip=document.createElement('div');tooltip.id='workbench-help-tooltip';tooltip.className='help-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);
 document.addEventListener('pointerover',e=>{const button=e.target.closest?.('[data-help]');if(button)show(button);else if(tooltip.contains(e.target))clearTimeout(timer);});
 document.addEventListener('pointerout',e=>{if(!owner)return;const from=e.target.closest?.('[data-help]');if(from===owner||tooltip.contains(e.target)){if(owner.contains(e.relatedTarget)||tooltip.contains(e.relatedTarget))return;timer=setTimeout(hide,120);}});
 document.addEventListener('focusin',e=>{const button=e.target.closest?.('[data-help]');if(button)show(button);});
 document.addEventListener('focusout',e=>{if(e.target===owner)hide();});
 document.addEventListener('click',e=>{const button=e.target.closest?.('[data-help]');if(button){e.preventDefault();e.stopPropagation();show(button);}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&owner){e.preventDefault();hide();}});
 document.addEventListener('scroll',hide,{capture:true,passive:true});
 window.addEventListener('resize',hide);window.addEventListener('hashchange',hide);
}
