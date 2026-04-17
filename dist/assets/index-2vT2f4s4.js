(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))l(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const o of i.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&l(o)}).observe(document,{childList:!0,subtree:!0});function s(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function l(n){if(n.ep)return;n.ep=!0;const i=s(n);fetch(n.href,i)}})();const x=new Set(["identity","work","consumption","creation","accumulation"]),S={layer:"desk",series:null,subcollection:null,view:null,item:null},L=new Set;function _(){return{...S}}function w(e,{silent:t=!1}={}){if(Object.assign(S,e),!t)for(const s of L)s({...S})}function H(e){return L.add(e),()=>L.delete(e)}function F(e){return x.has(e)}function C(){const e=window.location.pathname.replace(/^\/|\/$/g,"").split("/").filter(Boolean),s=new URLSearchParams(window.location.search).get("item")||null;if(e.length===0)return{layer:s?"item":"desk",series:null,subcollection:null,view:null,item:s};const[l,n]=e;return F(l)?l==="accumulation"?n?{layer:s?"item":"browse",series:l,subcollection:"ephemera",view:n,item:s}:{layer:"series",series:l,subcollection:"ephemera",view:null,item:null}:n?{layer:s?"item":"browse",series:l,subcollection:n,view:null,item:s}:{layer:s?"item":"series",series:l,subcollection:null,view:null,item:s}:{layer:"desk",series:null,subcollection:null,view:null,item:null}}function M(e){if(e.layer==="desk")return"/";if(e.series==="accumulation"){if(e.layer==="series")return"/accumulation/";const l=e.view||"all",n=e.item?`?item=${encodeURIComponent(e.item)}`:"";return`/accumulation/${l}/${n}`}let t=`/${e.series}/`;e.subcollection&&(t+=`${e.subcollection}/`);const s=e.item?`?item=${encodeURIComponent(e.item)}`:"";return t+s}function d(e){w(e);const t=M(_());history.pushState(null,"",t),console.log("[router] navigate →",t,_())}function P(e){w(e);const t=M(_());history.replaceState(null,"",t)}function N(){const e=C();w(e,{silent:!0}),console.log("[router] init →",window.location.pathname+window.location.search,e),window.addEventListener("popstate",()=>{const t=C();w(t),console.log("[router] popstate →",window.location.pathname,t)})}let f=null;const O=document.getElementById("app"),m=[];async function B(){f=await(await fetch("/data/archive.json")).json(),Y(),H(U);const t=_();t.layer!=="desk"&&D(t)}function U(e){const t=z(e),s=m.length;if(t<s)for(;m.length>t;)V();else t>s?y(e):t>0&&m[m.length-1].update(e)}function z(e){switch(e.layer){case"desk":return 0;case"series":return 1;case"browse":return 2;case"item":return 3;default:return 0}}function D(e){(e.layer==="series"||e.layer==="browse"||e.layer==="item")&&y({layer:"series",series:e.series,subcollection:null,item:null},!0),(e.layer==="browse"||e.layer==="item")&&y({layer:"browse",series:e.series,subcollection:e.subcollection,item:null},!0),e.layer==="item"&&y(e,!0)}function y(e,t=!1){var s;switch(e.layer){case"series":{const l=Object.keys(((s=f.series[e.series])==null?void 0:s.subcollections)||{});if(l.length===1){t||d({layer:"browse",series:e.series,subcollection:l[0],view:"all",item:null});return}k(G(e.series));break}case"browse":k(J(e.series,e.subcollection,e.item));break;case"item":k(Q(e.series,e.subcollection,e.item));break}}function k({veil:e,sheet:t,cleanup:s,update:l}){const n=m.length+1;e.style.setProperty("--depth",n),t.style.setProperty("--depth",n),document.body.appendChild(e),document.body.appendChild(t),m.push({veil:e,sheet:t,cleanup:s||(()=>{}),update:l||(()=>{})}),requestAnimationFrame(()=>{e.classList.add("layer-veil--visible"),t.classList.add("layer-sheet--visible")})}function V(){const e=m.pop();if(!e)return;e.veil.classList.remove("layer-veil--visible"),e.sheet.classList.remove("layer-sheet--visible"),e.cleanup();const t=()=>{e.veil.remove(),e.sheet.remove()};e.sheet.addEventListener("transitionend",t,{once:!0}),setTimeout(t,400)}function Y(){const e=Object.entries(f.series).sort((t,s)=>t[1].order-s[1].order);O.innerHTML=`
    <div class="desk">
      <div class="desk-objects">
        ${e.map(([t,s])=>`
          <button class="desk-object" data-series="${t}">
            <span class="desk-object__label">${s.label}</span>
            <span class="desk-object__container">${s.container}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `,O.querySelectorAll(".desk-object").forEach(t=>{t.addEventListener("click",()=>{d({layer:"series",series:t.dataset.series,subcollection:null,item:null})})})}function G(e){const t=f.series[e],s=Object.entries(t.subcollections),l=E(()=>{d({layer:"desk",series:null,subcollection:null,item:null})}),n=j();return n.innerHTML=`
    <div class="layer-sheet__inner">
      <button class="sheet-close" type="button" aria-label="Close">✕</button>
      <h1 class="sheet-title">${t.label}</h1>
      <p class="sheet-subtitle">${t.container}</p>
      <nav class="series-tabs" aria-label="Subcollections">
        ${s.map(([i,o])=>`
          <button class="series-tab" data-series="${e}" data-sub="${i}">
            ${o.label}
            <span class="series-tab__count">${o.items.length}</span>
          </button>
        `).join("")}
      </nav>
    </div>
  `,n.querySelector(".sheet-close").addEventListener("click",()=>{d({layer:"desk",series:null,subcollection:null,item:null})}),n.querySelectorAll(".series-tab").forEach(i=>{i.addEventListener("click",()=>{d({layer:"browse",series:i.dataset.series,subcollection:i.dataset.sub,item:null})})}),{veil:l,sheet:n}}function J(e,t,s){const l=f.series[e],n=l.subcollections[t],i=Object.entries(l.subcollections);T(n.items);const o=E(()=>{d({layer:"series",series:e,subcollection:null,item:null})}),b=j();function c(u){const p=l.subcollections[u],g=T(p.items);b.innerHTML=`
      <div class="layer-sheet__inner">
        <button class="sheet-close" type="button" aria-label="Close">✕</button>
        <nav class="series-tabs" aria-label="Subcollections">
          ${i.map(([r,a])=>`
            <button class="series-tab ${r===u?"series-tab--active":""}"
              data-series="${e}" data-sub="${r}">
              ${a.label}
              <span class="series-tab__count">${a.items.length}</span>
            </button>
          `).join("")}
        </nav>
        <div class="browse-header">
          <h2 class="sheet-title">${p.label}</h2>
          <p class="browse-count">${p.items.length} item${p.items.length!==1?"s":""}</p>
          ${l.subcollections&&Object.keys(l.subcollections).length===1?'<p class="browse-groupby-stub" aria-label="Sort options coming in a later phase">group by: year · event · place · type</p>':""}
        </div>
        <ul class="browse-list">
          ${g.map(({year:r,items:a})=>`
            <li>
              <p class="browse-year-divider">${r}</p>
              <ul class="browse-list">
                ${a.map($=>W($)).join("")}
              </ul>
            </li>
          `).join("")}
        </ul>
      </div>
    `,b.querySelector(".sheet-close").addEventListener("click",()=>{d({layer:"series",series:e,subcollection:null,item:null})}),b.querySelectorAll(".series-tab").forEach(r=>{r.addEventListener("click",()=>{d({layer:"browse",series:r.dataset.series,subcollection:r.dataset.sub,item:null})})}),b.querySelectorAll(".browse-item__trigger").forEach(r=>{r.addEventListener("click",()=>{d({layer:"item",series:e,subcollection:u,item:r.dataset.itemId})})})}c(t);function v(u){u.subcollection&&u.subcollection!==t&&(t=u.subcollection,c(t))}return{veil:o,sheet:b,update:v}}function Q(e,t,s){const i=f.series[e].subcollections[t].items;let o=i.findIndex(r=>r.id===s);o===-1&&(o=0);const b=E(()=>{d({layer:"browse",series:e,subcollection:t,item:null})}),c=j("layer-sheet--item");function v(r){var I,q,A;o=r;const a=i[r],$=r>0,R=r<i.length-1;c.innerHTML=`
      <div class="layer-sheet__inner layer-sheet__inner--item">
        <button class="sheet-close" type="button" aria-label="Close">✕</button>
        <div class="inspection-modal__content">
          <div class="inspection-modal__image-col">
            ${X(a)}
          </div>
          <div class="inspection-modal__meta-col">
            <h2 class="modal-title">${a.title}</h2>
            <dl class="modal-fields">
              ${h("date",a.display_date)}
              ${h("type",a.item_type)}
              ${h("place",a.place)}
              ${h("event",a.event)}
              ${h("source",a.source)}
            </dl>
            ${a.context_note?`<div class="modal-section"><h3 class="modal-section__label">note</h3><p>${a.context_note}</p></div>`:""}
            ${K(a,i)}
            ${(I=a.tags)!=null&&I.length?`<div class="modal-section"><h3 class="modal-section__label">tags</h3><p>${a.tags.join(" · ")}</p></div>`:""}
            <div class="modal-record">${a.id}</div>
          </div>
        </div>
        <div class="inspection-modal__nav">
          <button class="inspection-modal__prev" type="button" ${$?"":"disabled"}>← prev</button>
          <button class="inspection-modal__next" type="button" ${R?"":"disabled"}>next →</button>
        </div>
      </div>
    `,c.querySelector(".sheet-close").addEventListener("click",()=>{d({layer:"browse",series:e,subcollection:t,item:null})}),(q=c.querySelector(".inspection-modal__prev"))==null||q.addEventListener("click",()=>{o>0&&u(o-1)}),(A=c.querySelector(".inspection-modal__next"))==null||A.addEventListener("click",()=>{o<i.length-1&&u(o+1)}),Z(c),ee(c,i),c.querySelector(".sheet-close").focus()}function u(r){v(r),P({layer:"item",series:e,subcollection:t,item:i[r].id})}const p=r=>{var a;((a=m[m.length-1])==null?void 0:a.sheet)===c&&(r.key==="Escape"&&d({layer:"browse",series:e,subcollection:t,item:null}),r.key==="ArrowLeft"&&o>0&&u(o-1),r.key==="ArrowRight"&&o<i.length-1&&u(o+1))};document.addEventListener("keydown",p);const g=()=>document.removeEventListener("keydown",p);return v(o),{veil:b,sheet:c,cleanup:g}}function E(e){const t=document.createElement("div");return t.className="layer-veil",t.setAttribute("aria-hidden","true"),t.addEventListener("click",e),t}function j(e=""){const t=document.createElement("div");return t.className=`layer-sheet ${e}`.trim(),t.setAttribute("role","dialog"),t.setAttribute("aria-modal","true"),t}function W(e){var s;const t=(s=e.assets)!=null&&s.front?`<img src="${e.assets.front}" alt="" loading="lazy">`:"";return`
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
  `}function X(e){var s;if(!((s=e.assets)!=null&&s.front))return'<div class="browse-item__thumb"></div>';let t=`<img class="modal-image modal-image--front" src="${e.assets.front}" alt="${e.title}" id="modal-img-front">`;return e.assets.back&&(t+=`<img class="modal-image modal-image--back" src="${e.assets.back}" alt="${e.title} (back)" id="modal-img-back" hidden>`,t+='<button class="modal-flip-btn" id="modal-flip" type="button">↔ flip</button>'),t+='<button class="modal-zoom-btn" type="button">zoom</button>',t}function Z(e){const t=e.querySelector("#modal-flip");if(!t)return;let s=!0;t.addEventListener("click",()=>{s=!s,e.querySelector("#modal-img-front").hidden=!s,e.querySelector("#modal-img-back").hidden=s,t.textContent=s?"↔ flip":"↔ flip (back)"})}function K(e,t){var l;return(l=e.related_ids)!=null&&l.length?`<div class="modal-section"><h3 class="modal-section__label">related</h3><ul class="modal-related">${e.related_ids.map(n=>{const i=t.find(o=>o.id===n);return`<li><button class="modal-related__link" type="button" data-related-id="${n}">${i?i.title:n}</button></li>`}).join("")}</ul></div>`:""}function ee(e,t,s){e.querySelectorAll(".modal-related__link").forEach(l=>{l.addEventListener("click",()=>{const n=l.dataset.relatedId,i=t.findIndex(o=>o.id===n);i!==-1&&P({item:t[i].id})})})}function h(e,t){return t?`<div class="modal-field"><dt class="modal-field__label">${e}</dt><dd class="modal-field__value">${t}</dd></div>`:""}function T(e){const t=new Map;for(const s of e){const l=s.sort_date?s.sort_date.slice(0,4):"undated";t.has(l)||t.set(l,[]),t.get(l).push(s)}return Array.from(t.entries()).sort((s,l)=>l[0].localeCompare(s[0])).map(([s,l])=>({year:s,items:l}))}N();B();
