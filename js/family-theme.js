/* Approved lavender mix tag colors; no family data mutations. */
(function(){function apply(){const d=document; const labels=['#715697','#54759c','#4f827b','#98704c','#a05f79','#77717f'];
 const semantic=['접종','검진','발달','생활','안전','혜택','자동','직접','전국','지역','학교','학원','병원','놀이','기타'];
 const roots=d.querySelectorAll('body');roots.forEach(n=>['vx','hc','dv','lf','sf','bn'].forEach((key,i)=>n.style.setProperty('--k-'+key,labels[i])));
 d.querySelectorAll('.cat-chip,.hn-category,.cat-badge,.prov-tag,.scope-tag,.us-src-auto,.us-src-user,.hn-categories button,.hn-schedule-category').forEach(n=>{
  const name=(n.dataset.cat||n.textContent).trim();let index=semantic.findIndex(t=>name.includes(t));if(index<0){index=0;for(const c of name)index=(index+c.charCodeAt(0))%labels.length;}const color=labels[index%labels.length];
  n.style.setProperty('--cat',color);n.style.setProperty('--category',color);n.style.setProperty('--review-category',color);
  const selectable=n.matches('.cat-chip,.hn-categories button,.hn-schedule-category'),active=n.classList.contains('active')||n.classList.contains('on')||n.getAttribute('aria-pressed')==='true';
  n.style.setProperty('background',selectable&&!active?'transparent':color,'important');n.style.setProperty('color',selectable&&!active?color:'#fff','important');n.style.setProperty('border-color',color,'important');
 });
}
new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});apply();})();
