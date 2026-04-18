import"./modulepreload-polyfill-B5Qt9EMX.js";const U=new Set(["identity","labor","consumption","creation","accumulation"]),A={layer:"desk",series:null,subcollection:null,view:null,item:null},C=new Set;function L(){return{...A}}function E(e,{silent:t=!1}={}){if(Object.assign(A,e),!t)for(const s of C)s({...A})}function N(e){return C.add(e),()=>C.delete(e)}function z(e){return U.has(e)}function R(){const e=window.location.pathname.replace(/^\/|\/$/g,"").split("/").filter(Boolean),s=new URLSearchParams(window.location.search).get("item")||null;if(e.length===0)return{layer:"desk",series:null,subcollection:null,view:null,item:null};const[n,l]=e;if(n==="guide")return{layer:"guide",series:null,subcollection:null,view:null,item:null};if(!z(n))return{layer:"desk",series:null,subcollection:null,view:null,item:null};const i=n;return i==="labor"||i==="accumulation"?l?{layer:s?"item":"browse",series:i,subcollection:null,view:l,item:s}:{layer:"series",series:i,subcollection:null,view:null,item:null}:l?{layer:s?"item":"browse",series:i,subcollection:l,view:null,item:s}:{layer:s?"item":"series",series:i,subcollection:null,view:null,item:s}}function B(e){if(e.layer==="desk")return"/";if(e.layer==="guide")return"/guide/";if(e.series==="labor"||e.series==="accumulation"){if(e.layer==="series")return`/${e.series}/`;const n=e.view||"all",l=e.item?`?item=${encodeURIComponent(e.item)}`:"";return`/${e.series}/${n}/${l}`}let t=`/${e.series}/`;e.subcollection&&(t+=`${e.subcollection}/`);const s=e.item?`?item=${encodeURIComponent(e.item)}`:"";return t+s}function r(e){E(e);const t=B(L());history.pushState(null,"",t),console.log("[router] navigate →",t,L())}function D(e){E(e);const t=B(L());history.replaceState(null,"",t)}function G(){const e=R();E(e,{silent:!0}),console.log("[router] init →",window.location.pathname+window.location.search,e),window.addEventListener("popstate",()=>{const t=R();E(t),console.log("[router] popstate →",window.location.pathname,t)})}let y=null;const x=document.getElementById("app"),F=new Set(["labor","accumulation"]),b=[];async function W(){y=await(await fetch("/data/archive.json")).json(),Z(),N(Y);const t=L();t.layer!=="desk"&&Q(t)}function Y(e){const t=J(e),s=b.length;if(t<s)for(;b.length>t;)X();else t>s?$(e):t>0&&b[b.length-1].update(e)}function J(e){switch(e.layer){case"desk":return 0;case"guide":return 1;case"series":return 1;case"browse":return 2;case"item":return 3;default:return 0}}function Q(e){var s;if(e.layer==="guide"){$({layer:"guide"},!0);return}!(F.has(e.series)||Object.keys(((s=y.series[e.series])==null?void 0:s.subcollections)||{}).length<=1)&&(e.layer==="series"||e.layer==="browse"||e.layer==="item")&&$({layer:"series",series:e.series,subcollection:null,view:null,item:null},!0),(e.layer==="browse"||e.layer==="item")&&$({layer:"browse",series:e.series,subcollection:e.subcollection,view:e.view,item:null},!0),e.layer==="item"&&$(e,!0)}function $(e,t=!1){var s;switch(e.layer){case"guide":{S(K());break}case"series":{if(F.has(e.series)){t||r({layer:"browse",series:e.series,subcollection:null,view:e.view||"all",item:null});return}const n=Object.keys(((s=y.series[e.series])==null?void 0:s.subcollections)||{});if(n.length===1){t||r({layer:"browse",series:e.series,subcollection:n[0],view:"all",item:null});return}S(V(e.series));break}case"browse":S(ee(e.series,e.subcollection,e.view,e.item));break;case"item":S(te(e.series,e.subcollection,e.item));break}}function S({veil:e,sheet:t,cleanup:s,update:n}){const l=b.length+1,i=document.activeElement;e.style.setProperty("--depth",l),t.style.setProperty("--depth",l),document.body.appendChild(e),document.body.appendChild(t),b.push({veil:e,sheet:t,cleanup:s||(()=>{}),update:n||(()=>{}),returnFocus:i}),requestAnimationFrame(()=>{e.classList.add("layer-veil--visible"),t.classList.add("layer-sheet--visible")})}function X(){const e=b.pop();if(!e)return;e.veil.classList.remove("layer-veil--visible"),e.sheet.classList.remove("layer-sheet--visible"),e.cleanup();const t=()=>{e.veil.remove(),e.sheet.remove(),e.returnFocus&&typeof e.returnFocus.focus=="function"&&e.returnFocus.focus({preventScroll:!0})};e.sheet.addEventListener("transitionend",t,{once:!0}),setTimeout(t,400)}function Z(){const t=[...Object.entries(y.series).sort((s,n)=>s[1].order-n[1].order).map(([s,n])=>({type:"series",key:s,...n})),...y.guide?[{type:"guide",key:"guide",...y.guide}]:[]].sort((s,n)=>s.order-n.order);x.innerHTML=`
    <div class="desk">
      <div class="desk-objects">
        ${t.map(s=>`
          <button class="desk-object${s.type==="guide"?" desk-object--guide":""}" data-type="${s.type}" data-key="${s.key}">
            <span class="desk-object__label">${s.label}</span>
            <span class="desk-object__container">${s.container}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `,x.querySelectorAll(".desk-object").forEach(s=>{const n=s.dataset.type,l=s.dataset.key;n==="series"?s.addEventListener("click",()=>{r({layer:"series",series:l,subcollection:null,item:null})}):n==="guide"&&s.addEventListener("click",()=>{r({layer:"guide"})})})}function V(e){const t=y.series[e],s=Object.entries(t.subcollections),n=j(()=>{r({layer:"desk",series:null,subcollection:null,item:null})}),l=q();l.innerHTML=`
    <div class="layer-sheet__inner">
      <button class="sheet-close" type="button" aria-label="Close">✕</button>
      <h1 class="sheet-title">${t.label}</h1>
      <p class="sheet-subtitle">${t.container}</p>
      <nav class="series-tabs" aria-label="Subcollections">
        ${s.map(([o,g])=>`
          <button class="series-tab" data-series="${e}" data-sub="${o}">
            ${g.label}
            <span class="series-tab__count">${g.items.length}</span>
          </button>
        `).join("")}
      </nav>
    </div>
  `;const i=()=>r({layer:"desk",series:null,subcollection:null,item:null});l.querySelector(".sheet-close").addEventListener("click",i),l.querySelectorAll(".series-tab").forEach(o=>{o.addEventListener("click",()=>{r({layer:"browse",series:o.dataset.series,subcollection:o.dataset.sub,item:null})})});const f=T(l,i);return requestAnimationFrame(()=>{var o;return(o=l.querySelector(".sheet-close"))==null?void 0:o.focus()}),{veil:n,sheet:l,cleanup:f}}function K(){const e=j(()=>{r({layer:"desk"})}),t=q();t.innerHTML=`
    <div class="layer-sheet__inner">
      <button class="sheet-close" type="button" aria-label="Close">✕</button>
      <h1 class="sheet-title">Guide</h1>
      <p class="sheet-subtitle">Finding aid, sitemap, and archive metadata</p>
      <div class="guide-content">
        <p>This is a personal archive — a collection of records, artifacts, documents, and traces that describe a life through material evidence rather than through a simplified personal brand narrative.</p>
        <p>Navigate through the desk objects to explore the archive. Each series contains different types of material:</p>
        <ul>
          <li><strong>Identity:</strong> Biography, CV, and contact information</li>
          <li><strong>Labor:</strong> Work, projects, and professional effort</li>
          <li><strong>Consumption:</strong> Records of films, books, music, coffee, and games</li>
          <li><strong>Creation:</strong> Sketches, photos, prototypes, videos, and notes</li>
          <li><strong>Accumulation:</strong> Collected ephemera and physical artifacts</li>
        </ul>
      </div>
    </div>
  `;const s=()=>r({layer:"desk"});t.querySelector(".sheet-close").addEventListener("click",s);const n=T(t,s);return requestAnimationFrame(()=>{var l;return(l=t.querySelector(".sheet-close"))==null?void 0:l.focus()}),{veil:e,sheet:t,cleanup:n}}function ee(e,t,s,n){const l=y.series[e],i=F.has(e),f=i?[]:Object.entries(l.subcollections);function o(){return l.items?l.items:Object.values(l.subcollections||{}).flatMap(d=>d.items||[])}const g=j(()=>{r(i?{layer:"desk"}:{layer:"series",series:e,subcollection:null,item:null})}),m=q();function k(d,v){let p,_;if(i){let a=o();v&&v!=="all"&&(a=a.filter(h=>h.context===v||h.view===v)),p={label:v||"all",items:a},_=H(a)}else p=l.subcollections[d],_=H((p==null?void 0:p.items)||[]);m.innerHTML=`
      <div class="layer-sheet__inner">
        <button class="sheet-close" type="button" aria-label="Close">✕</button>
        ${f.length>0?`
          <nav class="series-tabs" aria-label="Subcollections">
            ${f.map(([a,h])=>`
              <button class="series-tab ${a===d?"series-tab--active":""}"
                data-series="${e}" data-sub="${a}">
                ${h.label}
                <span class="series-tab__count">${h.items.length}</span>
              </button>
            `).join("")}
          </nav>
        `:""}
        <div class="browse-header">
          <h2 class="sheet-title">${p.label}</h2>
          <p class="browse-count">${p.items.length} item${p.items.length!==1?"s":""}</p>
          ${f.length===0?'<p class="browse-groupby-stub" aria-label="Sort options coming in a later phase">group by: year · context · place · type</p>':f.length===1?'<p class="browse-groupby-stub" aria-label="Sort options coming in a later phase">group by: year · event · place · type</p>':""}
        </div>
        <ul class="browse-list">
          ${_.map(({year:a,items:h})=>`
            <li>
              <p class="browse-year-divider">${a}</p>
              <ul class="browse-list">
                ${h.map(I=>se(I)).join("")}
              </ul>
            </li>
          `).join("")}
        </ul>
      </div>
    `,m.querySelector(".sheet-close").addEventListener("click",()=>{r(i?{layer:"desk"}:{layer:"series",series:e,subcollection:null,item:null})}),m.querySelectorAll(".series-tab").forEach(a=>{a.addEventListener("click",()=>{r({layer:"browse",series:a.dataset.series,subcollection:a.dataset.sub,item:null})})}),m.querySelectorAll(".browse-item__trigger").forEach(a=>{a.addEventListener("click",()=>{r({layer:"item",series:e,subcollection:d,view:v,item:a.dataset.itemId})})})}const u=T(m,()=>{r(i?{layer:"desk"}:{layer:"series",series:e,subcollection:null,item:null})});k(t,s),requestAnimationFrame(()=>{var d;return(d=m.querySelector(".sheet-close"))==null?void 0:d.focus()});function c(d){d.subcollection&&d.subcollection!==t&&(t=d.subcollection,k(t,s)),d.view&&d.view!==s&&(s=d.view,k(t,s))}return{veil:g,sheet:m,update:c,cleanup:u}}function te(e,t,s){const n=y.series[e];let l;t&&n.subcollections[t]?l=n.subcollections[t].items:Object.keys(n.subcollections||{}).length>0?l=Object.values(n.subcollections).flatMap(u=>u.items||[]):l=n.items||[];let i=l.findIndex(u=>u.id===s);i===-1&&(i=0);const f=j(()=>{r({layer:"browse",series:e,subcollection:t,item:null})}),o=q("layer-sheet--item");function g(u){var p,_,a;i=u;const c=l[u],d=u>0,v=u<l.length-1;o.innerHTML=`
      <div class="layer-sheet__inner layer-sheet__inner--item">
        <button class="sheet-close" type="button" aria-label="Close">✕</button>
        <div class="inspection-modal__content">
          <div class="inspection-modal__image-col">
            ${le(c)}
          </div>
          <div class="inspection-modal__meta-col">
            <h2 class="modal-title">${c.title}</h2>
            <dl class="modal-fields">
              ${w("date",c.display_date)}
              ${w("type",c.item_type)}
              ${w("place",c.place)}
              ${w("event",c.event)}
              ${w("source",c.source)}
            </dl>
            ${c.context_note?`<div class="modal-section"><h3 class="modal-section__label">note</h3><p>${c.context_note}</p></div>`:""}
            ${ie(c,l)}
            ${(p=c.tags)!=null&&p.length?`<div class="modal-section"><h3 class="modal-section__label">tags</h3><p>${c.tags.join(" · ")}</p></div>`:""}
            <div class="modal-record">${c.id}</div>
          </div>
        </div>
        <div class="inspection-modal__nav">
          <button class="inspection-modal__prev" type="button" ${d?"":"disabled"}>← prev</button>
          <button class="inspection-modal__next" type="button" ${v?"":"disabled"}>next →</button>
        </div>
      </div>
    `,o.querySelector(".sheet-close").addEventListener("click",()=>{r({layer:"browse",series:e,subcollection:t,item:null})}),(_=o.querySelector(".inspection-modal__prev"))==null||_.addEventListener("click",()=>{i>0&&m(i-1)}),(a=o.querySelector(".inspection-modal__next"))==null||a.addEventListener("click",()=>{i<l.length-1&&m(i+1)}),ne(o),o.querySelectorAll(".modal-related__link").forEach(h=>{h.addEventListener("click",()=>{const I=h.dataset.relatedId,O=l.findIndex(P=>P.id===I);O!==-1&&m(O)})}),o.querySelector(".sheet-close").focus()}function m(u){g(u),D({layer:"item",series:e,subcollection:t,item:l[u].id})}const k=u=>{var c;((c=b[b.length-1])==null?void 0:c.sheet)===o&&(u.key==="Escape"&&r({layer:"browse",series:e,subcollection:t,item:null}),u.key==="ArrowLeft"&&i>0&&m(i-1),u.key==="ArrowRight"&&i<l.length-1&&m(i+1))};document.addEventListener("keydown",k);const M=()=>document.removeEventListener("keydown",k);return g(i),{veil:f,sheet:o,cleanup:M}}function T(e,t){const s=n=>{var l;n.key==="Escape"&&((l=b[b.length-1])==null?void 0:l.sheet)===e&&t()};return document.addEventListener("keydown",s),()=>document.removeEventListener("keydown",s)}function j(e){const t=document.createElement("div");return t.className="layer-veil",t.setAttribute("aria-hidden","true"),t.addEventListener("click",e),t}function q(e=""){const t=document.createElement("div");return t.className=`layer-sheet ${e}`.trim(),t.setAttribute("role","dialog"),t.setAttribute("aria-modal","true"),t}function se(e){var s;const t=(s=e.assets)!=null&&s.front?`<img src="${e.assets.front}" alt="" loading="lazy">`:"";return`
    <li class="browse-item">
      <button class="browse-item__trigger" type="button" data-item-id="${e.id}">
        <div class="browse-item__thumb">${t}</div>
        <div class="browse-item__info">
          <span class="browse-item__type">${e.item_type||""}</span>
          <span class="browse-item__title">${e.title}</span>
          ${e.display_date?`<span class="browse-item__date">${e.display_date}</span>`:""}
          ${e.place?`<span class="browse-item__place">${e.place}</span>`:""}
        </div>
      </button>
    </li>
  `}function le(e){var s;if(!((s=e.assets)!=null&&s.front))return'<div class="browse-item__thumb"></div>';let t=`<img class="modal-image modal-image--front" src="${e.assets.front}" alt="${e.title}" id="modal-img-front">`;return e.assets.back&&(t+=`<img class="modal-image modal-image--back" src="${e.assets.back}" alt="${e.title} (back)" id="modal-img-back" hidden>`,t+='<button class="modal-flip-btn" id="modal-flip" type="button">↔ flip</button>'),t+='<button class="modal-zoom-btn" type="button">zoom</button>',t}function ne(e){const t=e.querySelector("#modal-flip");if(!t)return;let s=!0;t.addEventListener("click",()=>{s=!s,e.querySelector("#modal-img-front").hidden=!s,e.querySelector("#modal-img-back").hidden=s,t.textContent=s?"↔ flip":"↔ flip (back)"})}function ie(e,t){var n;return(n=e.related_ids)!=null&&n.length?`<div class="modal-section"><h3 class="modal-section__label">related</h3><ul class="modal-related">${e.related_ids.map(l=>{const i=t.find(f=>f.id===l);return`<li><button class="modal-related__link" type="button" data-related-id="${l}">${i?i.title:l}</button></li>`}).join("")}</ul></div>`:""}function w(e,t){return t?`<div class="modal-field"><dt class="modal-field__label">${e}</dt><dd class="modal-field__value">${t}</dd></div>`:""}function H(e){const t=new Map;for(const s of e){const n=s.sort_date?s.sort_date.slice(0,4):"undated";t.has(n)||t.set(n,[]),t.get(n).push(s)}return Array.from(t.entries()).sort((s,n)=>n[0].localeCompare(s[0])).map(([s,n])=>({year:s,items:n}))}G();W();
