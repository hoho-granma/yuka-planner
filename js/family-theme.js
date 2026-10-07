/* Approved lavender mix tag colors; no family data mutations. */
(function(){function apply(){const d=document;
const brand=d.getElementById('brand-text');if(brand&&!brand.querySelector('.hn-house-name')){const text=brand.textContent,split=text.indexOf(' – ');if(split>=0){brand.replaceChildren(d.createTextNode(text.slice(0,split)+' '));const house=d.createElement('span');house.className='hn-house-name';house.textContent='– '+text.slice(split+3);brand.append(house);}}
 const labels=['#1764ce','#ba2874','#008367','#a76a00','#ce3b30','#7942bd'];
 const semantic=['접종','검진','발달','생활','안전','혜택','자동','직접','전국','지역','학교','학원','병원','놀이','기타'];
 const roots=d.querySelectorAll('body');roots.forEach(n=>['vx','hc','dv','lf','sf','bn'].forEach((key,i)=>n.style.setProperty('--k-'+key,labels[i])));
 d.querySelectorAll('.cat-chip,.hn-category,.cat-badge,.prov-tag,.scope-tag,.us-src-auto,.us-src-user,.hn-categories button,.hn-schedule-category').forEach(n=>{
  const name=(n.dataset.cat||n.textContent).trim();let index=semantic.findIndex(t=>name.includes(t));if(index<0){index=0;for(const c of name)index=(index+c.charCodeAt(0))%labels.length;}const color=labels[index%labels.length];
  n.style.setProperty('--cat',color);n.style.setProperty('--category',color);n.style.setProperty('--review-category',color);
  const selectable=n.matches('.cat-chip,.hn-categories button,.hn-schedule-category'),active=n.classList.contains('active')||n.classList.contains('on')||n.getAttribute('aria-pressed')==='true';
  n.style.setProperty('background',selectable&&!active?'transparent':color,'important');n.style.setProperty('color',selectable&&!active?color:'#fff','important');n.style.setProperty('border-color',color,'important');
 });
 const peach=['#d9cdef','#cadcf0','#c9e4d7','#efddba','#f0ccdc','#d8d4e4'];
 d.querySelectorAll('.hn-entry .hn-categories').forEach(group=>group.querySelectorAll('button').forEach((n,i)=>{const color=peach[i%6],active=n.classList.contains('on')||n.classList.contains('active');n.style.setProperty('--category',color);n.style.setProperty('background',active?color:'transparent','important');n.style.setProperty('color',active?'#40374b':'#665873','important');n.style.setProperty('border-color',color,'important');}));
 d.querySelectorAll('.hn-category-bar').forEach(n=>{const i=Math.max(0,['INSTITUTION','LESSON','MEDICAL','FAMILY','ETC'].indexOf(n.dataset.hnCategory));n.style.setProperty('background',peach[i%6],'important');});

}
new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});apply();})();
