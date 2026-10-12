/* Approved lavender mix tag colors; no family data mutations. */
(function(){function apply(){const d=document;
const brand=d.getElementById('brand-text');if(brand&&!brand.querySelector('.hn-house-name')){const text=brand.textContent,split=text.indexOf(' – ');if(split>=0){brand.replaceChildren(d.createTextNode(text.slice(0,split)+' '));const house=d.createElement('span');house.className='hn-house-name';house.textContent='– '+text.slice(split+3);brand.append(house);}}
 const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2]};
 const hex=c=>{if(/^#[0-9a-f]{6}$/i.test(String(c).trim()))return String(c).trim();const m=String(c).match(/\d+/g);return m&&m.length>=3?'#'+m.slice(0,3).map(x=>(+x).toString(16).padStart(2,'0')).join(''):String(c)};
 const inkOn=c=>{const h=hex(c);return /^#[0-9a-f]{6}$/i.test(h)&&lum(h)<.28?'#ffffff':'#40374b'}; // 진한 색은 흰 글씨, 파스텔은 어두운 글씨
 const labels=['#1764ce','#ba2874','#008367','#a76a00','#ce3b30','#7942bd'];
 const semantic=['접종','검진','발달','생활','안전','혜택','자동','직접','전국','지역','학교','학원','병원','놀이','기타'];
 const roots=d.querySelectorAll('body');roots.forEach(n=>['vx','hc','dv','lf','sf','bn'].forEach((key,i)=>n.style.setProperty('--k-'+key,labels[i])));
 d.querySelectorAll('.cat-chip,.cat-badge,.prov-tag,.scope-tag,.us-src-auto,.us-src-user,.hn-categories button,.hn-schedule-category').forEach(n=>{
  const name=(n.dataset.cat||n.textContent).trim();let index=semantic.findIndex(t=>name.includes(t));if(index<0){index=0;for(const c of name)index=(index+c.charCodeAt(0))%labels.length;}const color=labels[index%labels.length];
  n.style.setProperty('--cat',color);n.style.setProperty('--category',color);n.style.setProperty('--review-category',color);
  const selectable=n.matches('.cat-chip,.hn-categories button,.hn-schedule-category'),active=n.classList.contains('active')||n.classList.contains('on')||n.getAttribute('aria-pressed')==='true';
  n.style.setProperty('background',selectable&&!active?'transparent':color,'important');n.style.setProperty('color',selectable&&!active?color:'#fff','important');n.style.setProperty('border-color',color,'important');
 });
 // 뱃지 색은 앱이 칸 번호로 정한다(입력 폼과 같은 색) — 글자만 어둡게
 const peach=['#d9cdef','#cadcf0','#c9e4d7','#efddba','#f0ccdc','#d8d4e4','#c8e3e6','#e6d9c5'];
 d.querySelectorAll('.hn-category').forEach(n=>{let c=n.style.backgroundColor;if(!c){const name=n.textContent.trim();let index=semantic.findIndex(t=>name.includes(t));if(index<0){index=0;for(const ch of name)index=(index+ch.charCodeAt(0))%labels.length;}c=peach[index%peach.length];}n.style.setProperty('--review-category',c);n.style.setProperty('background',c,'important');n.style.setProperty('color',inkOn(c),'important');});
 d.querySelectorAll('.hn-entry .hn-categories').forEach(group=>group.querySelectorAll('button').forEach((n,i)=>{const color=n.dataset.hnColor||peach[i%peach.length],active=n.classList.contains('on')||n.classList.contains('active'),dark=inkOn(color)==='#ffffff';n.style.setProperty('--category',color);n.style.setProperty('background',active?color:'transparent','important');n.style.setProperty('color',active?inkOn(color):(dark?color:'#40374b'),'important');n.style.setProperty('border-color',color,'important');}));
 d.querySelectorAll('.hn-category-bar').forEach(n=>{const c=n.dataset.hnColor;if(c){n.style.setProperty('background',c,'important');n.style.setProperty('color',inkOn(c),'important');return;}const slot=Number(n.dataset.hnSlot),k=Number.isFinite(slot)&&n.dataset.hnSlot!==undefined?slot:Math.max(0,['INSTITUTION','LESSON','MEDICAL','FAMILY','ETC'].indexOf(n.dataset.hnCategory));n.style.setProperty('background',peach[k%peach.length],'important');});

}
new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});apply();})();
