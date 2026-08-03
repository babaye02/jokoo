(()=>{var a={};a.id=475,a.ids=[475],a.modules={261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},3295:a=>{"use strict";a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},10846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},19121:a=>{"use strict";a.exports=require("next/dist/server/app-render/action-async-storage.external.js")},29294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},44870:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},47654:(a,b,c)=>{"use strict";c.r(b),c.d(b,{handler:()=>I,patchFetch:()=>H,routeModule:()=>D,serverHooks:()=>G,workAsyncStorage:()=>E,workUnitAsyncStorage:()=>F});var d={};c.r(d),c.d(d,{default:()=>z});var e={};c.r(e),c.d(e,{GET:()=>C});var f=c(95736),g=c(9117),h=c(4044),i=c(39326),j=c(32324),k=c(261),l=c(54290),m=c(85328),n=c(38928),o=c(46595),p=c(3421),q=c(17679),r=c(41681),s=c(63446),t=c(86439),u=c(51356),v=c(10641),w=c(82513),x=c(58797);let y="https://jokooservices.com";async function z(){let a=new Date().toISOString(),b=[{url:`${y}/`,lastModified:a,changeFrequency:"weekly",priority:1},{url:`${y}/prestataires`,lastModified:a,changeFrequency:"monthly",priority:.9},{url:`${y}/apropos`,lastModified:a,changeFrequency:"monthly",priority:.6},{url:`${y}/contact`,lastModified:a,changeFrequency:"monthly",priority:.7},{url:`${y}/legal`,lastModified:a,changeFrequency:"weekly",priority:.7},{url:`${y}/blog`,lastModified:a,changeFrequency:"weekly",priority:.8}],c=w.M.map(a=>({url:`${y}/blog/${a.slug}`,lastModified:a.date,changeFrequency:"monthly",priority:.7})),d=[];try{d=(await (0,x.api)("/legal/documents")).map(a=>({url:`${y}/legal/${a.slug}`,lastModified:a.updated_at,changeFrequency:"monthly",priority:.6}))}catch{}return[...b,...c,...d]}var A=c(39582);let B={...d}.default;if("function"!=typeof B)throw Error('Default export is missing in "/app/website/app/sitemap.ts"');async function C(a,b){let{__metadata_id__:c,...d}=await b.params||{},e=!!c&&c.endsWith(".xml");if(c&&!e)return new v.NextResponse("Not Found",{status:404});let f=c&&e?c.slice(0,-4):void 0,g=await B({id:f}),h=(0,A.resolveRouteData)(g,"sitemap");return new v.NextResponse(h,{headers:{"Content-Type":"application/xml","Cache-Control":"public, max-age=0, must-revalidate"}})}let D=new f.AppRouteRouteModule({definition:{kind:g.RouteKind.APP_ROUTE,page:"/sitemap.xml/route",pathname:"/sitemap.xml",filename:"sitemap",bundlePath:"app/sitemap.xml/route"},distDir:".next",relativeProjectDir:"",resolvedPagePath:"next-metadata-route-loader?filePath=%2Fapp%2Fwebsite%2Fapp%2Fsitemap.ts&isDynamicRouteExtension=1!?__next_metadata_route__",nextConfigOutput:"",userland:e}),{workAsyncStorage:E,workUnitAsyncStorage:F,serverHooks:G}=D;function H(){return(0,h.patchFetch)({workAsyncStorage:E,workUnitAsyncStorage:F})}async function I(a,b,c){var d;let e="/sitemap.xml/route";"/index"===e&&(e="/");let f=await D.prepare(a,b,{srcPage:e,multiZoneDraftMode:!1});if(!f)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:h,params:v,nextConfig:w,isDraftMode:x,prerenderManifest:y,routerServerContext:z,isOnDemandRevalidate:A,revalidateOnlyGenerated:B,resolvedPathname:C}=f,E=(0,k.normalizeAppPath)(e),F=!!(y.dynamicRoutes[E]||y.routes[C]);if(F&&!x){let a=!!y.routes[C],b=y.dynamicRoutes[E];if(b&&!1===b.fallback&&!a)throw new t.NoFallbackError}let G=null;!F||D.isDev||x||(G="/index"===(G=C)?"/":G);let H=!0===D.isDev||!F,I=F&&!H,J=a.method||"GET",K=(0,j.getTracer)(),L=K.getActiveScopeSpan(),M={params:v,prerenderManifest:y,renderOpts:{experimental:{cacheComponents:!!w.experimental.cacheComponents,authInterrupts:!!w.experimental.authInterrupts},supportsDynamicResponse:H,incrementalCache:(0,i.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:null==(d=w.experimental)?void 0:d.cacheLife,isRevalidate:I,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d)=>D.onRequestError(a,b,d,z)},sharedContext:{buildId:h}},N=new l.NodeNextRequest(a),O=new l.NodeNextResponse(b),P=m.NextRequestAdapter.fromNodeNextRequest(N,(0,m.signalFromNodeResponse)(b));try{let d=async c=>D.handle(P,M).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=K.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==n.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${J} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${J} ${a.url}`)}),f=async f=>{var h,j;let k=async({previousCacheEntry:g})=>{try{if(!(0,i.getRequestMeta)(a,"minimalMode")&&A&&B&&!g)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let e=await d(f);a.fetchMetrics=M.renderOpts.fetchMetrics;let h=M.renderOpts.pendingWaitUntil;h&&c.waitUntil&&(c.waitUntil(h),h=void 0);let j=M.renderOpts.collectedTags;if(!F)return await (0,p.I)(N,O,e,M.renderOpts.pendingWaitUntil),null;{let a=await e.blob(),b=(0,q.toNodeOutgoingHttpHeaders)(e.headers);j&&(b[s.NEXT_CACHE_TAGS_HEADER]=j),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==M.renderOpts.collectedRevalidate&&!(M.renderOpts.collectedRevalidate>=s.INFINITE_CACHE)&&M.renderOpts.collectedRevalidate,d=void 0===M.renderOpts.collectedExpire||M.renderOpts.collectedExpire>=s.INFINITE_CACHE?void 0:M.renderOpts.collectedExpire;return{value:{kind:u.CachedRouteKind.APP_ROUTE,status:e.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:d}}}}catch(b){throw(null==g?void 0:g.isStale)&&await D.onRequestError(a,b,{routerKind:"App Router",routePath:e,routeType:"route",revalidateReason:(0,o.c)({isRevalidate:I,isOnDemandRevalidate:A})},z),b}},l=await D.handleResponse({req:a,nextConfig:w,cacheKey:G,routeKind:g.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:y,isRoutePPREnabled:!1,isOnDemandRevalidate:A,revalidateOnlyGenerated:B,responseGenerator:k,waitUntil:c.waitUntil});if(!F)return null;if((null==l||null==(h=l.value)?void 0:h.kind)!==u.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(j=l.value)?void 0:j.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});(0,i.getRequestMeta)(a,"minimalMode")||b.setHeader("x-nextjs-cache",A?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),x&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,q.fromNodeOutgoingHttpHeaders)(l.value.headers);return(0,i.getRequestMeta)(a,"minimalMode")&&F||m.delete(s.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||b.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,r.getCacheControlHeader)(l.cacheControl)),await (0,p.I)(N,O,new Response(l.value.body,{headers:m,status:l.value.status||200})),null};L?await f(L):await K.withPropagatedContext(a.headers,()=>K.trace(n.BaseServerSpan.handleRequest,{spanName:`${J} ${a.url}`,kind:j.SpanKind.SERVER,attributes:{"http.method":J,"http.target":a.url}},f))}catch(b){if(b instanceof t.NoFallbackError||await D.onRequestError(a,b,{routerKind:"App Router",routePath:E,routeType:"route",revalidateReason:(0,o.c)({isRevalidate:I,isOnDemandRevalidate:A})}),F)throw b;return await (0,p.I)(N,O,new Response(null,{status:500})),null}}},58797:(a,b,c)=>{"use strict";c.d(b,{api:()=>e});var d=c(97954);(0,d.registerClientReference)(function(){throw Error("Attempted to call API_BASE() from the server but API_BASE is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"/app/website/app/lib/api.ts","API_BASE"),(0,d.registerClientReference)(function(){throw Error("Attempted to call TOKEN_KEY() from the server but TOKEN_KEY is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"/app/website/app/lib/api.ts","TOKEN_KEY"),(0,d.registerClientReference)(function(){throw Error("Attempted to call setAuthToken() from the server but setAuthToken is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"/app/website/app/lib/api.ts","setAuthToken"),(0,d.registerClientReference)(function(){throw Error("Attempted to call ApiError() from the server but ApiError is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"/app/website/app/lib/api.ts","ApiError"),(0,d.registerClientReference)(function(){throw Error("Attempted to call apiFetch() from the server but apiFetch is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"/app/website/app/lib/api.ts","apiFetch");let e=(0,d.registerClientReference)(function(){throw Error("Attempted to call api() from the server but api is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"/app/website/app/lib/api.ts","api")},63033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},78335:()=>{},82513:(a,b,c)=>{"use strict";c.d(b,{M:()=>d,f:()=>e});let d=[{slug:"trouver-plombier-dakar",title:"Comment trouver un bon plombier \xe0 Dakar en 2026",description:"Guide complet pour trouver un plombier fiable, rapide et abordable \xe0 Dakar. Prix, d\xe9lais, urgences 24/7 — tout ce qu'il faut savoir.",date:"2026-07-30",category:"Guides",readingTime:"5 min",cover:"\uD83D\uDD27",content:`
## Le probl\xe8me : trouver un plombier fiable \xe0 Dakar

Une fuite un dimanche soir, un chauffe-eau qui rend l'\xe2me avant la Tabaski, un WC bouch\xe9 en pleine r\xe9ception… Trouver un plombier comp\xe9tent \xe0 Dakar peut vite virer au casse-t\xeate.

Voici notre guide 2026 pour trouver **le bon plombier**, sans se faire arnaquer.

## 1. V\xe9rifiez les avis clients

Les vrais avis (avec photos, pr\xe9noms complets, dates) sont la meilleure garantie. Sur Jokoo, chaque prestataire affiche sa note moyenne et ses derniers avis v\xe9rifi\xe9s.

> Astuce : m\xe9fiez-vous d'un profil qui n'a que des 5★ sans commentaires d\xe9taill\xe9s.

## 2. Demandez un devis avant intervention

Un professionnel s\xe9rieux vous donnera :
- Un tarif horaire clair (5 000 \xe0 15 000 FCFA/h \xe0 Dakar)
- Une estimation du temps d'intervention
- Le prix des pi\xe8ces s\xe9par\xe9ment

## 3. Privil\xe9giez les urgences 24/7

Les vraies urgences (fuite majeure, WC bouch\xe9, chauffe-eau HS) ne peuvent pas attendre. Sur Jokoo, vous filtrez directement par **disponibilit\xe9 imm\xe9diate**.

## 4. Choisissez la localisation proche

Un plombier \xe0 Yoff pour une urgence \xe0 Ouakam mettra 45 min. Filtrez par quartier pour gagner du temps et payer moins de frais de d\xe9placement.

## Les tarifs moyens \xe0 Dakar en 2026

| Prestation | Prix moyen |
|-----------|-----------|
| Fuite simple | 5 000 – 10 000 FCFA |
| D\xe9bouchage WC | 8 000 – 15 000 FCFA |
| Installation chauffe-eau | 25 000 – 50 000 FCFA |
| Urgence nuit/weekend | +50% |

## Conclusion

Trouver un bon plombier \xe0 Dakar ne devrait plus \xeatre un pari. Avec **Jokoo**, vous avez acc\xe8s \xe0 des prestataires v\xe9rifi\xe9s, not\xe9s, disponibles pr\xe8s de chez vous, avec paiement s\xe9curis\xe9.

[T\xe9l\xe9chargez l'app](/#download) et trouvez votre plombier en 2 minutes.
    `.trim()},{slug:"covoiturage-dakar-saint-louis",title:"Covoiturage Dakar ↔ Saint-Louis : tarifs, temps, conseils",description:"Combien co\xfbte un covoiturage Dakar → Saint-Louis en 2026 ? Temps de trajet, conseils s\xe9curit\xe9, avantages \xe9cologiques. Le guide complet.",date:"2026-07-28",category:"Mobilit\xe9",readingTime:"6 min",cover:"\uD83D\uDE97",content:`
## Dakar ↔ Saint-Louis : l'axe le plus fr\xe9quent\xe9 du S\xe9n\xe9gal

Chaque semaine, des milliers de S\xe9n\xe9galais empruntent l'axe Dakar → Saint-Louis pour le travail, la famille ou le tourisme. Le **covoiturage** est devenu la solution la plus \xe9conomique et conviviale.

## Combien \xe7a co\xfbte ?

En 2026, le covoiturage Dakar → Saint-Louis co\xfbte en moyenne **6 000 \xe0 8 000 FCFA par passager**, contre :
- **12 000 FCFA** en bus climatis\xe9
- **35 000 – 50 000 FCFA** en location de voiture avec chauffeur
- **80 000+ FCFA** en avion

## Combien de temps ?

- **3h30 \xe0 4h** en conditions normales
- **5h+** les vendredis soir et dimanches (bouchons Rufisque)

## Conseils s\xe9curit\xe9

1. **V\xe9rifiez le badge V\xe9rifi\xe9** du conducteur sur Jokoo (permis, assurance, CNI).
2. **Consultez les avis** des passagers pr\xe9c\xe9dents.
3. **Partagez votre trajet** avec un proche via le bouton d\xe9di\xe9 dans l'app.
4. **Bouton SOS** disponible en cas de probl\xe8me.

## Un impact \xe9cologique r\xe9el

Chaque covoiturage \xe9vite en moyenne **0,2 tonne de CO₂** par trajet Dakar → Saint-Louis. Sur un an, si 100 personnes covoiturent 2x/semaine, c'est **2 000 tonnes** de CO₂ \xe9conomis\xe9es.

## Envie de partir ?

[Trouvez un covoiturage](/#mobilite) sur Jokoo en 30 secondes.
    `.trim()},{slug:"baby-sitter-verifiee-senegal",title:"Comment choisir une baby-sitter de confiance au S\xe9n\xe9gal ?",description:"Crit\xe8res, tarifs, v\xe9rifications \xe0 faire, questions \xe0 poser — le guide complet pour choisir une baby-sitter fiable pour vos enfants.",date:"2026-07-25",category:"Family",readingTime:"7 min",cover:"\uD83D\uDC76",content:`
## Confier ses enfants : une d\xe9cision qui ne s'improvise pas

Que ce soit pour une soir\xe9e, un mariage \xe0 l'int\xe9rieur du pays ou un besoin r\xe9gulier, choisir une **baby-sitter** est une d\xe9cision qui touche \xe0 ce qu'on a de plus cher. Voici comment faire le bon choix.

## Les 5 crit\xe8res indispensables

### 1. La formation
Une bonne baby-sitter conna\xeet :
- Les gestes de premiers secours
- La nutrition adapt\xe9e aux enfants
- Les techniques d'endormissement
- Les activit\xe9s d'\xe9veil selon l'\xe2ge

### 2. Les v\xe9rifications d'identit\xe9
Sur Jokoo Family, **toutes les baby-sitters V\xe9rifi\xe9es+** ont fourni :
- Carte Nationale d'Identit\xe9
- Casier judiciaire vierge
- R\xe9f\xe9rences v\xe9rifi\xe9es (anciens employeurs)
- Certification premiers secours

### 3. Les langues parl\xe9es
Fran\xe7ais, wolof, anglais, arabe — assurez-vous que la baby-sitter parle la langue de votre enfant.

### 4. Les avis v\xe9rifi\xe9s
Lisez les commentaires d\xe9taill\xe9s d'autres parents. Attention aux profils sans commentaires.

### 5. Le feeling
Organisez toujours une **premi\xe8re rencontre courte** (1h max) avant de confier vos enfants pour la premi\xe8re fois.

## Tarifs moyens au S\xe9n\xe9gal

| Type de garde | Tarif horaire |
|---|---|
| Baby-sitter standard | 1 500 – 3 000 FCFA/h |
| Baby-sitter V\xe9rifi\xe9e+ | 3 000 – 5 000 FCFA/h |
| Garde de nuit | 15 000 – 25 000 FCFA/nuit |
| Weekend complet | 40 000 – 80 000 FCFA |

## Questions \xe0 poser lors du premier \xe9change

1. Depuis combien de temps gardez-vous des enfants ?
2. Quel est votre plus jeune / plus \xe2g\xe9 ?
3. Que faites-vous si l'enfant refuse de dormir ?
4. Que faites-vous en cas de blessure l\xe9g\xe8re ?
5. Avez-vous des r\xe9f\xe9rences que je peux appeler ?

## Le bouton SOS Jokoo Family

Toutes les gardes r\xe9serv\xe9es via **Jokoo Family** incluent un bouton SOS 24/7 qui alerte imm\xe9diatement notre \xe9quipe et vos contacts d'urgence.

[Trouvez une baby-sitter](/#family) sur Jokoo Family.
    `.trim()}];function e(a){return d.find(b=>b.slug===a)||null}},86439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},96487:()=>{},97954:(a,b,c)=>{"use strict";a.exports=c(49754).vendored["react-rsc"].ReactServerDOMWebpackServer}};var b=require("../../webpack-runtime.js");b.C(a);var c=b.X(0,[124,579],()=>b(b.s=47654));module.exports=c})();