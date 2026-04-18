import"./modulepreload-polyfill-B5Qt9EMX.js";const z=new Set(["identity","labor","consumption","creation","accumulation"]),C={layer:"desk",series:null,subcollection:null,view:null,item:null},F=new Set;function E(){return{...C}}function L(e,{silent:t=!1}={}){if(Object.assign(C,e),!t)for(const s of F)s({...C})}function D(e){return F.add(e),()=>F.delete(e)}function G(e){return z.has(e)}function R(){const e=window.location.pathname.replace(/^\/|\/$/g,"").split("/").filter(Boolean),s=new URLSearchParams(window.location.search).get("item")||null;if(e.length===0)return{layer:"desk",series:null,subcollection:null,view:null,item:null};const[l,n]=e;if(l==="guide")return{layer:"guide",series:null,subcollection:null,view:null,item:null};if(!G(l))return{layer:"desk",series:null,subcollection:null,view:null,item:null};const i=l;return i==="labor"||i==="accumulation"?n?{layer:s?"item":"browse",series:i,subcollection:null,view:n,item:s}:{layer:"series",series:i,subcollection:null,view:null,item:null}:n?{layer:s?"item":"browse",series:i,subcollection:n,view:null,item:s}:{layer:s?"item":"series",series:i,subcollection:null,view:null,item:s}}function U(e){if(e.layer==="desk")return"/";if(e.layer==="guide")return"/guide/";if(e.series==="labor"||e.series==="accumulation"){if(e.layer==="series")return`/${e.series}/`;const l=e.view||"all",n=e.item?`?item=${encodeURIComponent(e.item)}`:"";return`/${e.series}/${l}/${n}`}let t=`/${e.series}/`;e.subcollection&&(t+=`${e.subcollection}/`);const s=e.item?`?item=${encodeURIComponent(e.item)}`:"";return t+s}function r(e){L(e);const t=U(E());history.pushState(null,"",t),console.log("[router] navigate →",t,E())}function W(e){L(e);const t=U(E());history.replaceState(null,"",t)}function Y(){const e=R();L(e,{silent:!0}),console.log("[router] init →",window.location.pathname+window.location.search,e),window.addEventListener("popstate",()=>{const t=R();L(t),console.log("[router] popstate →",window.location.pathname,t)})}const J="";function j(e,t="original"){return e?e.startsWith("http")?e:`${J}/${t==="thumbnail"?"thumbnails":"originals"}/${e}`:null}let y=null;const B=document.getElementById("app"),T=new Set(["labor","accumulation"]),b=[];async function Q(){y=await(await fetch("/data/archive.json")).json(),ee(),D(X);const t=E();t.layer!=="desk"&&V(t)}function X(e){const t=Z(e),s=b.length;if(t<s)for(;b.length>t;)K();else t>s?$(e):t>0&&b[b.length-1].update(e)}function Z(e){switch(e.layer){case"desk":return 0;case"guide":return 1;case"series":return 1;case"browse":return 2;case"item":return 3;default:return 0}}function V(e){var s;if(e.layer==="guide"){$({layer:"guide"},!0);return}!(T.has(e.series)||Object.keys(((s=y.series[e.series])==null?void 0:s.subcollections)||{}).length<=1)&&(e.layer==="series"||e.layer==="browse"||e.layer==="item")&&$({layer:"series",series:e.series,subcollection:null,view:null,item:null},!0),(e.layer==="browse"||e.layer==="item")&&$({layer:"browse",series:e.series,subcollection:e.subcollection,view:e.view,item:null},!0),e.layer==="item"&&$(e,!0)}function $(e,t=!1){var s;switch(e.layer){case"guide":{S(se());break}case"series":{if(T.has(e.series)){t||r({layer:"browse",series:e.series,subcollection:null,view:e.view||"all",item:null});return}const l=Object.keys(((s=y.series[e.series])==null?void 0:s.subcollections)||{});if(l.length===1){t||r({layer:"browse",series:e.series,subcollection:l[0],view:"all",item:null});return}S(te(e.series));break}case"browse":S(le(e.series,e.subcollection,e.view,e.item));break;case"item":S(ne(e.series,e.subcollection,e.item));break}}function S({veil:e,sheet:t,cleanup:s,update:l}){const n=b.length+1,i=document.activeElement;e.style.setProperty("--depth",n),t.style.setProperty("--depth",n),document.body.appendChild(e),document.body.appendChild(t),b.push({veil:e,sheet:t,cleanup:s||(()=>{}),update:l||(()=>{}),returnFocus:i}),requestAnimationFrame(()=>{e.classList.add("layer-veil--visible"),t.classList.add("layer-sheet--visible")})}function K(){const e=b.pop();if(!e)return;e.veil.classList.remove("layer-veil--visible"),e.sheet.classList.remove("layer-sheet--visible"),e.cleanup();const t=()=>{e.veil.remove(),e.sheet.remove(),e.returnFocus&&typeof e.returnFocus.focus=="function"&&e.returnFocus.focus({preventScroll:!0})};e.sheet.addEventListener("transitionend",t,{once:!0}),setTimeout(t,400)}function ee(){const t=[...Object.entries(y.series).sort((s,l)=>s[1].order-l[1].order).map(([s,l])=>({type:"series",key:s,...l})),...y.guide?[{type:"guide",key:"guide",...y.guide}]:[]].sort((s,l)=>s.order-l.order);B.innerHTML=`
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
  `,B.querySelectorAll(".desk-object").forEach(s=>{const l=s.dataset.type,n=s.dataset.key;l==="series"?s.addEventListener("click",()=>{r({layer:"series",series:n,subcollection:null,item:null})}):l==="guide"&&s.addEventListener("click",()=>{r({layer:"guide"})})})}function te(e){const t=y.series[e],s=Object.entries(t.subcollections),l=q(()=>{r({layer:"desk",series:null,subcollection:null,item:null})}),n=A();n.innerHTML=`
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
  `;const i=()=>r({layer:"desk",series:null,subcollection:null,item:null});n.querySelector(".sheet-close").addEventListener("click",i),n.querySelectorAll(".series-tab").forEach(o=>{o.addEventListener("click",()=>{r({layer:"browse",series:o.dataset.series,subcollection:o.dataset.sub,item:null})})});const h=x(n,i);return requestAnimationFrame(()=>{var o;return(o=n.querySelector(".sheet-close"))==null?void 0:o.focus()}),{veil:l,sheet:n,cleanup:h}}function se(){const e=q(()=>{r({layer:"desk"})}),t=A();t.innerHTML=`
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
  `;const s=()=>r({layer:"desk"});t.querySelector(".sheet-close").addEventListener("click",s);const l=x(t,s);return requestAnimationFrame(()=>{var n;return(n=t.querySelector(".sheet-close"))==null?void 0:n.focus()}),{veil:e,sheet:t,cleanup:l}}function le(e,t,s,l){const n=y.series[e],i=T.has(e),h=i?[]:Object.entries(n.subcollections);function o(){return n.items?n.items:Object.values(n.subcollections||{}).flatMap(d=>d.items||[])}const g=q(()=>{r(i?{layer:"desk"}:{layer:"series",series:e,subcollection:null,item:null})}),m=A();function k(d,v){let p,_;if(i){let a=o();v&&v!=="all"&&(a=a.filter(f=>f.context===v||f.view===v)),p={label:v||"all",items:a},_=H(a)}else p=n.subcollections[d],_=H((p==null?void 0:p.items)||[]);m.innerHTML=`
      <div class="layer-sheet__inner">
        <button class="sheet-close" type="button" aria-label="Close">✕</button>
        ${h.length>0?`
          <nav class="series-tabs" aria-label="Subcollections">
            ${h.map(([a,f])=>`
              <button class="series-tab ${a===d?"series-tab--active":""}"
                data-series="${e}" data-sub="${a}">
                ${f.label}
                <span class="series-tab__count">${f.items.length}</span>
              </button>
            `).join("")}
          </nav>
        `:""}
        <div class="browse-header">
          <h2 class="sheet-title">${p.label}</h2>
          <p class="browse-count">${p.items.length} item${p.items.length!==1?"s":""}</p>
          ${h.length===0?'<p class="browse-groupby-stub" aria-label="Sort options coming in a later phase">group by: year · context · place · type</p>':h.length===1?'<p class="browse-groupby-stub" aria-label="Sort options coming in a later phase">group by: year · event · place · type</p>':""}
        </div>
        <ul class="browse-list">
          ${_.map(({year:a,items:f})=>`
            <li>
              <p class="browse-year-divider">${a}</p>
              <ul class="browse-list">
                ${f.map(I=>ie(I)).join("")}
              </ul>
            </li>
          `).join("")}
        </ul>
      </div>
    `,m.querySelector(".sheet-close").addEventListener("click",()=>{r(i?{layer:"desk"}:{layer:"series",series:e,subcollection:null,item:null})}),m.querySelectorAll(".series-tab").forEach(a=>{a.addEventListener("click",()=>{r({layer:"browse",series:a.dataset.series,subcollection:a.dataset.sub,item:null})})}),m.querySelectorAll(".browse-item__trigger").forEach(a=>{a.addEventListener("click",()=>{r({layer:"item",series:e,subcollection:d,view:v,item:a.dataset.itemId})})})}const u=x(m,()=>{r(i?{layer:"desk"}:{layer:"series",series:e,subcollection:null,item:null})});k(t,s),requestAnimationFrame(()=>{var d;return(d=m.querySelector(".sheet-close"))==null?void 0:d.focus()});function c(d){d.subcollection&&d.subcollection!==t&&(t=d.subcollection,k(t,s)),d.view&&d.view!==s&&(s=d.view,k(t,s))}return{veil:g,sheet:m,update:c,cleanup:u}}function ne(e,t,s){const l=y.series[e];let n;t&&l.subcollections[t]?n=l.subcollections[t].items:Object.keys(l.subcollections||{}).length>0?n=Object.values(l.subcollections).flatMap(u=>u.items||[]):n=l.items||[];let i=n.findIndex(u=>u.id===s);i===-1&&(i=0);const h=q(()=>{r({layer:"browse",series:e,subcollection:t,item:null})}),o=A("layer-sheet--item");function g(u){var p,_,a;i=u;const c=n[u],d=u>0,v=u<n.length-1;o.innerHTML=`
      <div class="layer-sheet__inner layer-sheet__inner--item">
        <button class="sheet-close" type="button" aria-label="Close">✕</button>
        <div class="inspection-modal__content">
          <div class="inspection-modal__image-col">
            ${oe(c)}
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
            ${ae(c,n)}
            ${(p=c.tags)!=null&&p.length?`<div class="modal-section"><h3 class="modal-section__label">tags</h3><p>${c.tags.join(" · ")}</p></div>`:""}
            <div class="modal-record">${c.id}</div>
          </div>
        </div>
        <div class="inspection-modal__nav">
          <button class="inspection-modal__prev" type="button" ${d?"":"disabled"}>← prev</button>
          <button class="inspection-modal__next" type="button" ${v?"":"disabled"}>next →</button>
        </div>
      </div>
    `,o.querySelector(".sheet-close").addEventListener("click",()=>{r({layer:"browse",series:e,subcollection:t,item:null})}),(_=o.querySelector(".inspection-modal__prev"))==null||_.addEventListener("click",()=>{i>0&&m(i-1)}),(a=o.querySelector(".inspection-modal__next"))==null||a.addEventListener("click",()=>{i<n.length-1&&m(i+1)}),re(o),o.querySelectorAll(".modal-related__link").forEach(f=>{f.addEventListener("click",()=>{const I=f.dataset.relatedId,O=n.findIndex(N=>N.id===I);O!==-1&&m(O)})}),o.querySelector(".sheet-close").focus()}function m(u){g(u),W({layer:"item",series:e,subcollection:t,item:n[u].id})}const k=u=>{var c;((c=b[b.length-1])==null?void 0:c.sheet)===o&&(u.key==="Escape"&&r({layer:"browse",series:e,subcollection:t,item:null}),u.key==="ArrowLeft"&&i>0&&m(i-1),u.key==="ArrowRight"&&i<n.length-1&&m(i+1))};document.addEventListener("keydown",k);const M=()=>document.removeEventListener("keydown",k);return g(i),{veil:h,sheet:o,cleanup:M}}function x(e,t){const s=l=>{var n;l.key==="Escape"&&((n=b[b.length-1])==null?void 0:n.sheet)===e&&t()};return document.addEventListener("keydown",s),()=>document.removeEventListener("keydown",s)}function q(e){const t=document.createElement("div");return t.className="layer-veil",t.setAttribute("aria-hidden","true"),t.addEventListener("click",e),t}function A(e=""){const t=document.createElement("div");return t.className=`layer-sheet ${e}`.trim(),t.setAttribute("role","dialog"),t.setAttribute("aria-modal","true"),t}function P(e){var t,s,l,n;return((t=e.assets)==null?void 0:t.front)||((s=e.assets)==null?void 0:s.poster)||((l=e.assets)==null?void 0:l.cover)||((n=e.assets)==null?void 0:n.primary)||null}function ie(e){var l;const t=j((l=e.assets)==null?void 0:l.thumbnail,"thumbnail")||j(P(e),"original"),s=t?`<img src="${t}" alt="" loading="lazy">`:"";return`
    <li class="browse-item">
      <button class="browse-item__trigger" type="button" data-item-id="${e.id}">
        <div class="browse-item__thumb">${s}</div>
        <div class="browse-item__info">
          <span class="browse-item__type">${e.item_type||""}</span>
          <span class="browse-item__title">${e.title}</span>
          ${e.display_date?`<span class="browse-item__date">${e.display_date}</span>`:""}
          ${e.place?`<span class="browse-item__place">${e.place}</span>`:""}
        </div>
      </button>
    </li>
  `}function oe(e){var n;const t=P(e);if(!t)return'<div class="browse-item__thumb"></div>';let l=`<img class="modal-image modal-image--front" src="${j(t,"original")}" alt="${e.title}" id="modal-img-front">`;if((n=e.assets)!=null&&n.back){const i=j(e.assets.back,"original");l+=`<img class="modal-image modal-image--back" src="${i}" alt="${e.title} (back)" id="modal-img-back" hidden>`,l+='<button class="modal-flip-btn" id="modal-flip" type="button">↔ flip</button>'}return l+='<button class="modal-zoom-btn" type="button">zoom</button>',l}function re(e){const t=e.querySelector("#modal-flip");if(!t)return;let s=!0;t.addEventListener("click",()=>{s=!s,e.querySelector("#modal-img-front").hidden=!s,e.querySelector("#modal-img-back").hidden=s,t.textContent=s?"↔ flip":"↔ flip (back)"})}function ae(e,t){var l;return(l=e.related_ids)!=null&&l.length?`<div class="modal-section"><h3 class="modal-section__label">related</h3><ul class="modal-related">${e.related_ids.map(n=>{const i=t.find(h=>h.id===n);return`<li><button class="modal-related__link" type="button" data-related-id="${n}">${i?i.title:n}</button></li>`}).join("")}</ul></div>`:""}function w(e,t){return t?`<div class="modal-field"><dt class="modal-field__label">${e}</dt><dd class="modal-field__value">${t}</dd></div>`:""}function H(e){const t=new Map;for(const s of e){const l=s.sort_date?s.sort_date.slice(0,4):"undated";t.has(l)||t.set(l,[]),t.get(l).push(s)}return Array.from(t.entries()).sort((s,l)=>l[0].localeCompare(s[0])).map(([s,l])=>({year:s,items:l}))}Y();Q();
