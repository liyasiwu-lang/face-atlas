(() => {
  const DATA = window.BEAUTY_ATLAS_DATA;
  const EXAMPLES = window.ATLAS_EXAMPLES || {};
  const EXAMPLES_BY_ID = window.ATLAS_EXAMPLES_BY_ID || {};
  const BASE_BRANDS = window.BRAND_PRODUCT_DATA || [];
  const DIRECTORY_EXPANSION = window.BRAND_DIRECTORY_EXPANSION || [];
  const CATALOG = window.FACE_CATALOG || {brands:[],products:[],categories:[],regionLabels:{}};
  const PRODUCT_EXPANSION = window.BRAND_PRODUCT_EXPANSION || [];
  const PRODUCT_IMAGES = window.BRAND_PRODUCT_IMAGES || {};
  const BRAND_ID_MAP = {
    mac:'BR-CA-001',nars:'BR-US-003','bobbi-brown':'BR-US-008','estee-lauder':'BR-US-009',
    clinique:'BR-US-010',maybelline:'BR-US-004','loreal-paris':'BR-FR-007',lancome:'BR-FR-004',
    dior:'BR-FR-001',chanel:'BR-FR-003',ysl:'BR-FR-002',armani:'BR-IT-003',mufe:'BR-FR-008',
    fenty:'BR-US-001',rare:'BR-US-002','charlotte-tilbury':'BR-UK-001','pat-mcgrath':'BR-UK-002',
    benefit:'BR-US-007','urban-decay':'BR-US-006','too-faced':'BR-US-011',tarte:'BR-US-012',
    elf:'BR-US-005',nyx:'BR-US-013',colourpop:'BR-US-014',kiko:'BR-IT-001',
    shiseido:'BR-JP-006','shu-uemura':'BR-JP-005',canmake:'BR-JP-002',kate:'BR-JP-004',
    laneige:'BR-KR-009',etude:'BR-KR-004',hera:'BR-KR-007',romand:'BR-KR-001',
    clio:'BR-KR-003','3ce':'BR-KR-002',florasis:'BR-CN-007','perfect-diary':'BR-CN-006',
    judydoll:'BR-CN-003',maogeping:'BR-CN-009',carslan:'BR-CN-010'
  };
  const ORIGIN_META = {
    CA:['加拿大','北美'],US:['美国','北美'],FR:['法国','欧洲'],GB:['英国','欧洲'],
    IT:['意大利','欧洲'],JP:['日本','东亚'],KR:['韩国','东亚'],CN:['中国','东亚']
  };
  const CATALOG_BRANDS = CATALOG.brands.map(item => {
    const [origin,region]=ORIGIN_META[item.origin]||[item.origin,'其他'];
    return {
      id:BRAND_ID_MAP[item.id],catalogId:item.id,brand:item.name,localName:item.nameZh,
      origin,region,tier:'目录集合',focus:'首批代表产品目录',heroLines:[],
      signature:'首批代表产品已收录',source:item.website,sourceType:'品牌官网',
      verifiedAt:'2026-09-14',status:'目录来源已核验',
      note:'由首批代表产品目录自动聚合，用于关联产品记录；不参与奢华、高端、大众或专业等品牌定位分级。'
    };
  });
  const existingBrandIds=new Set([...BASE_BRANDS,...DIRECTORY_EXPANSION].map(item=>item.id));
  const BRANDS=[...BASE_BRANDS,...DIRECTORY_EXPANSION,...CATALOG_BRANDS.filter(item=>!existingBrandIds.has(item.id))];
  const categoryNames=Object.fromEntries(CATALOG.categories.map(item=>[item.id,item.name.replace('全部品类','全部')]));
  const catalogBrandById=Object.fromEntries(CATALOG.brands.map(item=>[item.id,item]));
  const brandById=Object.fromEntries(BRANDS.map(item=>[item.id,item]));
  const CATALOG_PRODUCTS=CATALOG.products.map(item=>{
    const catalogBrand=catalogBrandById[item.brandId];
    const brandRecordId=BRAND_ID_MAP[item.brandId];
    const brand=brandById[brandRecordId];
    return {...item,brandRecordId,brandName:brand?.brand||catalogBrand?.name||'',brandLocalName:brand?.localName||catalogBrand?.nameZh||'',categoryName:categoryNames[item.category]||item.category};
  });
  const BRAND_PRODUCTS=[...CATALOG_PRODUCTS,...PRODUCT_EXPANSION];
  const $ = s => document.querySelector(s);
  const modes = [
    {id:'brands',label:'品牌',en:'GLOBAL BRANDS',title:'跨国家热门品牌',count:BRANDS.length},
    {id:'brandProducts',label:'品牌产品',en:'POPULAR PRODUCTS',title:'品牌代表产品',count:BRAND_PRODUCTS.length},
    {id:'products',label:'产品',en:'PRODUCTS',title:'产品图鉴',count:DATA.products.length},
    {id:'shades',label:'色彩',en:'COLORS',title:'通用色彩与色号',count:DATA.shades.length},
    {id:'finishes',label:'质地 / 妆效',en:'TEXTURES & FINISHES',title:'质地、妆效与覆盖',count:DATA.finishes.length},
    {id:'styles',label:'妆容风格',en:'MAKEUP STYLES',title:'妆容风格图鉴',count:DATA.styles.length},
    {id:'nails',label:'美甲',en:'NAIL ATLAS',title:'甲型、构图与效果',count:DATA.nails.length},
    {id:'comparisons',label:'易混对照',en:'DISAMBIGUATION',title:'质地与甲型易混对照',count:(DATA.comparisons||[]).length}
  ];
  const deepLinkParams=new URLSearchParams(window.location.search);
  const requestedMode=deepLinkParams.get('mode');
  let mode=modes.some(item=>item.id===requestedMode)?requestedMode:'brands', primary='全部', secondary='全部', visible=24, activeUndertone='N';
  let beautyDialogNav = null;
  const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const getItems = () => mode==='brands'?BRANDS:mode==='brandProducts'?BRAND_PRODUCTS:mode==='comparisons'?(DATA.comparisons||[]):DATA[mode];
  const fields = {
    brands:{primary:'origin',secondary:'tier'},
    brandProducts:{primary:'categoryName',secondary:'brandName'},
    products:{primary:'area',secondary:'category'}, shades:{primary:'kind',secondary:'family'},
    finishes:{primary:'dimension',secondary:null}, styles:{primary:'family',secondary:null}, nails:{primary:'dimension',secondary:null},
    comparisons:{primary:'group',secondary:null}
  };
  const searchFields = item => Object.values(item).flat().filter(v=>typeof v==='string').join(' ').toLowerCase();

  function brandProductExampleName(item){
    const direct = {
      '粉底液':'粉底液','粉底膏':'粉底膏','精华粉底液':'精华粉底','气垫':'气垫粉底',
      '遮瑕液':'遮瑕液','定妆粉饼':'定妆粉饼','散粉':'透明散粉','液体腮红':'液体腮红',
      '腮红':'粉状腮红','膏状腮红':'腮红膏','修容盘':'修容盘','修容粉':'中性修容粉',
      '眼影盘':'眼影盘','单色眼影':'单色眼影','眼影棒':'眼影棒','眼线液笔':'眼线液笔',
      '眼线笔':'眼线铅笔','眉笔':'眉笔','砍刀眉笔':'眉笔','眉粉':'眉粉',
      '唇线笔':'唇线笔','染唇液':'染唇液','有色唇部护理':'有色润唇膏',
      '润色唇膏':'有色润唇膏','雕花唇膏':'传统口红','唇彩':'唇蜜',
      '液体唇彩':'唇釉','妆前凝胶':'抓妆妆前','有色面霜':'粉底液',
      '肤色调节液':'提亮妆前乳','水感底妆':'精华粉底','多用彩妆笔':'眼线铅笔',
      '高光粉膏':'粉状高光'
    };
    if(item.subcategory==='睫毛膏'){
      if(item.featureTags.includes('浓密')) return '浓密睫毛膏';
      if(item.featureTags.includes('卷翘')) return '卷翘睫毛膏';
      return '纤长睫毛膏';
    }
    if(item.subcategory==='定妆喷雾') return item.finish.includes('哑光')?'哑光定妆喷雾':'强力定妆喷雾';
    if(item.subcategory==='唇膏'){
      if(item.finish.some(value=>value.includes('哑光')||value.includes('柔雾'))) return '哑光口红';
      if(item.finish.some(value=>value.includes('缎光'))) return '缎光口红';
      return '传统口红';
    }
    return direct[item.subcategory]||'粉底液';
  }

  function exampleVisual(item, large=false){
    if(mode==='brands') return `<div class="brand-visual${large?' large':''}" aria-label="${esc(item.brand)}品牌资料"><span>${esc(item.id.split('-')[1])}</span><b>${esc(item.brand)}</b><small>${esc(item.origin)} · ${esc(item.tier)}</small></div>`;
    if(mode==='brandProducts'){
      const image=PRODUCT_IMAGES[item.id];
      if(['official','retailer'].includes(image?.status)&&image.localFile){
        const sourceLabel=image.status==='official'?'品牌官网产品图':'可信零售商商品图';
        return `<figure class="example-figure product-example product-photo${large?' large':''}"><img src="${esc(image.localFile)}" alt="${esc(item.brandName)} ${esc(item.name)} 真实商品图" loading="${large?'eager':'lazy'}">${large?`<figcaption>${sourceLabel} · 来源已记录</figcaption>`:''}</figure>`;
      }
      const exampleName=brandProductExampleName(item);
      const ex=(EXAMPLES.products||{})[exampleName];
      if(ex) return `<figure class="example-figure product-example${large?' large':''}"><div class="example-sprite" role="img" aria-label="${esc(item.nameZh)}的${esc(exampleName)}形态示意，非官方包装实拍" style="--sheet:url('${esc(ex.file)}');--x:${ex.x};--y:${ex.y}"></div>${large?'<figcaption>产品形态示意 · 非官方包装实拍</figcaption>':''}</figure>`;
      return `<div class="product-visual${large?' large':''}" data-category="${esc(item.category)}"><span>${esc(item.id)}</span><b>${esc(item.brandName)}</b><small>${esc(item.subcategory)} · ${esc(item.form)}</small></div>`;
    }
    if(mode==='shades'){
      const ex=(EXAMPLES_BY_ID.shades||{})[item.id];
      if(!ex) return `<div class="example-pending${large?' large':''}" aria-label="${esc(item.name)}图例制作中"><span>图例制作中</span><small>已预留独立图例位</small></div>`;
      return `<figure class="example-figure${large?' large':''}"><div class="example-sprite" role="img" aria-label="${esc(ex.alt)}" style="--sheet:url('${esc(ex.file)}');--x:${ex.x};--y:${ex.y}"></div>${large?'<figcaption>AI 辅助图例 · 色彩与质地以实物和光线为准</figcaption>':''}</figure>`;
    }
    const ex=(EXAMPLES_BY_ID[mode]||{})[item.id] || (EXAMPLES[mode]||{})[item.name];
    if(!ex) return `<div class="example-pending${large?' large':''}" aria-label="${esc(item.name)}图例制作中"><span>图例制作中</span><small>已预留独立图例位</small></div>`;
    return `<figure class="example-figure${large?' large':''}"><div class="example-sprite" role="img" aria-label="${esc(ex.alt)}" style="--sheet:url('${esc(ex.file)}');--x:${ex.x};--y:${ex.y}"></div>${large?'<figcaption>AI 辅助图例 · 色彩与质地以实物和光线为准</figcaption>':''}</figure>`;
  }

  const beautyExampleCount=['products','finishes','styles','nails']
    .reduce((sum,key)=>sum+DATA[key].filter(item=>(EXAMPLES_BY_ID[key]||{})[item.id]||(EXAMPLES[key]||{})[item.name]).length,0)
    +DATA.shades.filter(item=>(EXAMPLES_BY_ID.shades||{})[item.id]).length;
  const brandProductExampleCount=BRAND_PRODUCTS.filter(item=>(EXAMPLES.products||{})[brandProductExampleName(item)]).length;
  $('#beauty-stats').innerHTML = [
    [BRANDS.length,'热门品牌'],[BRAND_PRODUCTS.length,'代表产品'],[new Set(BRANDS.map(item=>item.origin)).size,'国家地区'],[DATA.products.length,'产品类型'],[DATA.shades.length,'通用色号'],
    [beautyExampleCount+brandProductExampleCount,'美妆可视图例']
  ].map(x=>`<div><strong>${x[0]}</strong><span>${x[1]}</span></div>`).join('');

  function renderModes(){
    $('#atlas-modes').innerHTML=modes.map(m=>`<button class="mode-button" type="button" aria-selected="${m.id===mode}" tabindex="${m.id===mode?0:-1}" data-mode="${m.id}"><span>${m.label}</span><small>${m.count}</small></button>`).join('');
    $('#atlas-modes').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;primary='全部';secondary='全部';visible=24;renderAll()}));
    if(!$('#atlas-modes').dataset.kbInit){
      $('#atlas-modes').dataset.kbInit='1';
      $('#atlas-modes').addEventListener('keydown',e=>{
        const b=e.target.closest('button');
        if(!b) return;
        const bs=[...$('#atlas-modes').querySelectorAll('button')];
        const i=bs.indexOf(b);
        if(i<0) return;
        let n=-1;
        switch(e.key){
          case 'ArrowRight':case 'ArrowDown': n=(i+1)%bs.length; break;
          case 'ArrowLeft':case 'ArrowUp': n=(i-1+bs.length)%bs.length; break;
          case 'Home': n=0; break;
          case 'End': n=bs.length-1; break;
        }
        if(n>=0){e.preventDefault();bs[n].focus();bs[n].click();}
      });
    }
  }
  function unique(field, items=getItems()){return field?[...new Set(items.map(x=>x[field]).filter(Boolean))]:[]}
  function chips(target,values,active,onPick){
    target.innerHTML=['全部',...values].map(v=>`<button class="beauty-chip" type="button" aria-pressed="${v===active}" tabindex="${v===active?0:-1}" data-value="${esc(v)}">${esc(v)}</button>`).join('');
    target.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>onPick(b.dataset.value)));
    if(!target.dataset.kbInit){
      target.dataset.kbInit='1';
      target.addEventListener('keydown',e=>{
        const b=e.target.closest('button');
        if(!b||!target.contains(b)) return;
        const bs=[...target.querySelectorAll('button')];
        const i=bs.indexOf(b);
        if(i<0) return;
        let n=-1;
        switch(e.key){
          case 'ArrowRight':case 'ArrowDown': n=(i+1)%bs.length; break;
          case 'ArrowLeft':case 'ArrowUp': n=(i-1+bs.length)%bs.length; break;
          case 'Home': n=0; break;
          case 'End': n=bs.length-1; break;
        }
        if(n>=0){e.preventDefault();bs[n].focus();bs[n].click();}
      });
    }
  }
  function renderFilters(){
    const cfg=fields[mode];
    chips($('#primary-filters'),unique(cfg.primary),primary,v=>{primary=v;secondary='全部';visible=24;renderFilters();renderItems()});
    const subset=primary==='全部'?getItems():getItems().filter(x=>x[cfg.primary]===primary);
    const secondaryValues=unique(cfg.secondary,subset);
    $('#secondary-filter-row').hidden=!cfg.secondary;
    if(cfg.secondary) chips($('#secondary-filters'),secondaryValues,secondary,v=>{secondary=v;visible=24;renderFilters();renderItems()});
  }
  function filtered(){
    const cfg=fields[mode],q=$('#beauty-search-input').value.trim().toLowerCase();
    return getItems().filter(x=>(primary==='全部'||x[cfg.primary]===primary)&&(!cfg.secondary||secondary==='全部'||x[cfg.secondary]===secondary)&&(!q||searchFields(x).includes(q)));
  }
  function summary(item){
    if(mode==='brands') return item.note;
    if(mode==='brandProducts') return item.description;
    if(mode==='products') return item.description;
    if(mode==='shades') return item.description;
    if(mode==='finishes') return item.definition;
    if(mode==='styles') return item.definition;
    if(mode==='comparisons') return item.difference;
    return item.definition;
  }
  function card(item){
    if(mode==='comparisons'){
      return `<button class="beauty-card comparison-card" type="button" data-id="${esc(item.pair)}"><span class="card-top"><span>${esc(item.group)}</span><span>对照</span></span><h3>${esc(item.pair)}</h3><p>${esc(item.difference)}</p><span class="arrow">↗</span></button>`;
    }
    const top = mode==='brands'?[item.origin,item.tier]:mode==='brandProducts'?[item.categoryName,item.brandLocalName]:mode==='products'?[item.area,item.category]:mode==='shades'?[item.kind,item.family]:mode==='finishes'?[item.dimension,'术语']:mode==='styles'?[item.family,'风格']: [item.dimension,item.length==='—'?'美甲':item.length];
    const colorClass='';
    const swatch='';
    const palette=mode==='styles'?`<span class="mini-palette">${item.palette.map(c=>`<i style="--c:${c}"></i>`).join('')}</span>`:'';
    const title=mode==='brands'?item.brand:mode==='brandProducts'?item.nameZh:item.name;
    const subtitle=mode==='brands'?item.localName:mode==='brandProducts'?`${item.brandName} · ${item.name}`:item.en;
    return `<button class="beauty-card${colorClass}${mode==='brands'?' brand-card':''}" type="button" data-id="${item.id}">${swatch}${exampleVisual(item)}<span class="card-top"><span>${esc(top[0])}</span><span>${esc(top[1])}</span></span><h3>${esc(title)}</h3><span class="en">${esc(subtitle)}</span>${palette}<p>${esc(summary(item))}</p><span class="arrow">↗</span></button>`;
  }
  function renderItems(){
    const list=filtered(),m=modes.find(x=>x.id===mode);
    $('#mode-eyebrow').textContent=m.en;$('#mode-title').textContent=m.title;$('#beauty-result-count').textContent=list.length;
    $('#beauty-grid').innerHTML=list.slice(0,visible).map(card).join('');
    $('#beauty-empty').hidden=!!list.length;$('#beauty-load-more').hidden=list.length<=visible;
    $('#beauty-grid').querySelectorAll('.beauty-card').forEach(b=>b.addEventListener('click',()=>openItem(getItems().find(x=>(x.id||x.pair)===b.dataset.id))));
  }
  function detailBoxes(item){
    if(mode==='brands') return [['国家 / 地区',`${item.origin} · ${item.region}`],['品牌定位',item.tier],['重点品类',item.focus],['代表产品线',item.heroLines.join(' · ')||'待补充'],['典型视觉与妆效',item.signature],['数据状态',`${item.status} · 核验于 ${item.verifiedAt}`]];
    if(mode==='brandProducts'){
      const image=PRODUCT_IMAGES[item.id];
      const imageStatus=image?.status==='official'?'品牌官网图已记录':image?.status==='retailer'?'可信零售商图已记录':'形态示意待补真实图';
      return [['所属品牌',`${item.brandLocalName} · ${item.brandName}`],['品类',`${item.categoryName} · ${item.subcategory}`],['产品形态',item.form],['常见妆效',item.finish.join(' · ')],['特征标签',item.featureTags.join(' · ')],['资料状态',`${imageStatus} · 更新于 ${item.updatedAt}`]];
    }
    if(mode==='products') return [['产品形态',item.form],['覆盖/显色',item.coverage],['常见妆效',item.finish],['产品说明',item.description],['品类用途',item.purpose],['未来品牌字段','品牌 · 系列 · 官方色号 · 市场 · 在售状态'],['标签 Prompt',item.prompt]];
    if(mode==='shades') return [['色彩家族',item.family],['底调',item.undertone],['深浅',item.depth],['适用产品',item.applies.join(' · ')],['定义',item.description],['品牌说明','当前为通用色名；品牌、系列和官方色号字段已预留'],['标签 Prompt',item.prompt]];
    if(mode==='finishes') return [['所属维度',item.dimension],['定义',item.definition],['容易混淆',item.contrast],['标签 Prompt',item.prompt]];
    if(mode==='styles') return [['底妆',item.base],['眼妆',item.eyes],['面颊',item.cheeks],['唇妆',item.lips],['美甲',item.nails],['风格定义',item.definition],['标签 Prompt',item.prompt]];
    if(mode==='comparisons') return [['对照分组',item.group],['辨析要点',item.difference],['观察提示',item.tip]];
    return [['维度',item.dimension],['适合长度',item.length],['定义',item.definition],['使用说明',item.note],['标签 Prompt',item.prompt]];
  }
  function provenanceHTML(item){
    const record=window.FACE_ATLAS_PROVENANCE?.resolve(item,'beauty',{mode});
    if(!record) return '';
    const productImage=mode==='brandProducts'?PRODUCT_IMAGES[item.id]:null;
    const directUrl=mode==='brands'?item.source:mode==='brandProducts'?(productImage?.pageUrl||item.sourceUrl):'';
    const directLabel=mode==='brands'?`${item.brand} ${item.sourceType}`:mode==='brandProducts'?`${item.brandName} ${item.nameZh} 产品页面`:'';
    const direct=directUrl?`<li class="provenance-direct"><a href="${esc(directUrl)}" target="_blank" rel="noopener noreferrer">${esc(directLabel)}</a><span>单条记录来源 · 用于核对名称、产品线、包装图片与页面状态</span></li>`:'';
    const links=record.sources.map(source=>`<li><a href="${esc(source.url)}"${source.url.startsWith('http')?' target="_blank" rel="noopener noreferrer"':''}>${esc(source.title)}</a><span>${esc(source.scope)} 使用限制：${esc(source.limitation)}</span></li>`).join('');
    const reviewedAt=item.updatedAt||item.verifiedAt||record.reviewedAt;
    return `<section class="provenance-panel" aria-labelledby="beauty-provenance-title">
      <div class="provenance-heading"><div><span>资料来源</span><h3 id="beauty-provenance-title">${esc(record.reviewLabel)}</h3></div><time datetime="${esc(reviewedAt)}">${esc(reviewedAt)}</time></div>
      <p>${esc(record.reviewNote)}</p>
      <details open><summary>适用来源与分类边界</summary><ul>${direct}${links}</ul><a class="provenance-method-link" href="./methodology.html#beauty-source-matrix">查看完整美妆来源矩阵 →</a></details>
    </section>`;
  }
  function openItem(item){
    const swatch='';
    const palette=mode==='styles'?`<div class="palette-large">${item.palette.map(c=>`<i style="--c:${c}"></i>`).join('')}</div>`:'';
    const title=mode==='brands'?item.brand:mode==='brandProducts'?item.nameZh:mode==='comparisons'?item.pair:item.name;
    const subtitle=mode==='brands'?item.localName:mode==='brandProducts'?`${item.brandName} · ${item.name}`:mode==='comparisons'?item.group:item.en;
    const productImage=mode==='brandProducts'?PRODUCT_IMAGES[item.id]:null;
    const source=mode==='brands'?`<a class="official-source" href="${esc(item.source)}" target="_blank" rel="noopener noreferrer">查看${esc(item.sourceType)} ↗</a>`:mode==='brandProducts'?`<a class="official-source" href="${esc(productImage?.pageUrl||item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${['official','retailer'].includes(productImage?.status)?'查看产品图片来源':'查看品牌官网'} ↗</a>`:'';
    const related=mode==='brands'?BRAND_PRODUCTS.filter(product=>product.brandRecordId===item.id):[];
    const relatedProducts=mode!=='brands'?'':related.length?`<section class="brand-products"><div><span>POPULAR PRODUCTS</span><b>${related.length} 个首批代表产品</b></div>${related.map(product=>`<article><span>${esc(product.categoryName)} · ${esc(product.subcategory)}</span><h3>${esc(product.nameZh)}</h3><p>${esc(product.name)}</p><small>${esc(product.finish.join(' · '))} · ${esc(product.form)}</small></article>`).join('')}</section>`:`<p class="brand-products-empty">该品牌的具体代表产品将在下一批补充。</p>`;
    $('#beauty-dialog-content').innerHTML=`<div class="dialog-inner">${swatch}${exampleVisual(item,true)}<p class="dialog-eyebrow">${esc(item.id||item.pair||'对照')} · ${esc(modes.find(x=>x.id===mode).label)}</p><h2 id="beauty-dialog-title">${esc(title)}</h2><p class="dialog-en">${esc(subtitle)}</p>${palette}<div class="detail-grid">${detailBoxes(item).map((x,i)=>`<div class="detail-box${i>1?' full':''}"><span>${esc(x[0])}</span><p>${esc(x[1])}</p></div>`).join('')}</div>${relatedProducts}${source}${provenanceHTML(item)}<p class="kbd-hint">键盘：← → 切换上一条/下一条，Esc 关闭</p></div>`;
    const list = filtered();
    const idx = list.findIndex(x => (x.id || x.pair) === (item.id || item.pair));
    beautyDialogNav = idx >= 0 ? { list, index: idx } : null;
    const dialog=$('#beauty-dialog');
    if (!dialog.open) {
      const trigger=document.activeElement;
      dialog.addEventListener('close',()=>{ if(trigger && trigger.isConnected) trigger.focus(); },{once:true});
      dialog.showModal();
    }
    const closeBtn = dialog.querySelector('.dialog-close');
    if (closeBtn) closeBtn.focus();
  }
  function renderFoundation(){
    const base=DATA.shades.filter(x=>x.kind==='底妆色阶');
    const undertones=[...new Map(base.map(x=>[x.id.slice(-1),x.undertone])).entries()];
    $('#undertone-controls').innerHTML=undertones.map(([code,name])=>`<button class="undertone-button" type="button" aria-pressed="${code===activeUndertone}" tabindex="${code===activeUndertone?0:-1}" data-code="${code}">${code} · ${name}</button>`).join('');
    $('#undertone-controls').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{activeUndertone=b.dataset.code;renderFoundation()}));
    if(!$('#undertone-controls').dataset.kbInit){
      $('#undertone-controls').dataset.kbInit='1';
      $('#undertone-controls').addEventListener('keydown',e=>{
        const b=e.target.closest('button');
        if(!b) return;
        const bs=[...$('#undertone-controls').querySelectorAll('button')];
        const i=bs.indexOf(b);
        if(i<0) return;
        let n=-1;
        switch(e.key){
          case 'ArrowRight':case 'ArrowDown': n=(i+1)%bs.length; break;
          case 'ArrowLeft':case 'ArrowUp': n=(i-1+bs.length)%bs.length; break;
          case 'Home': n=0; break;
          case 'End': n=bs.length-1; break;
        }
        if(n>=0){e.preventDefault();bs[n].focus();bs[n].click();}
      });
    }
    const list=base.filter(x=>x.id.endsWith(activeUndertone));
    $('#foundation-grid').innerHTML=list.map(x=>{const rgb=x.hex.match(/\w\w/g).map(v=>parseInt(v,16)),lum=(.299*rgb[0]+.587*rgb[1]+.114*rgb[2]);return `<button class="foundation-cell" type="button" data-id="${x.id}" style="--shade:${x.hex};--text:${lum<125?'#fff':'#17151b'}"><b>${esc(x.id.replace('FD-','D'))}</b><span>${esc(x.depth)}<br>${esc(x.undertone)}</span></button>`}).join('');
    $('#foundation-grid').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{const previousMode=mode;mode='shades';openItem(DATA.shades.find(x=>x.id===b.dataset.id));mode=previousMode}));
  }
  function renderAll(){renderModes();renderFilters();renderItems()}
  function openDeepLinkedItem(){
    const target=deepLinkParams.get('item');
    if(!target) return;
    const item=getItems().find(entry=>entry.id===target||entry.name===target);
    if(!item) return;
    primary='全部';secondary='全部';visible=24;
    $('#beauty-search-input').value=mode==='brands'?item.brand:item.name;
    renderAll();
    openItem(item);
    requestAnimationFrame(()=>document.querySelector(`[data-id="${CSS.escape(item.id)}"]`)?.scrollIntoView({block:'center'}));
  }
  $('#beauty-search-input').addEventListener('input',()=>{visible=24;renderItems()});
  $('#beauty-search-input').addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();$('#beauty-search-input').value='';visible=24;renderItems();$('#beauty-search-input').blur();}
    else if(e.key==='Enter'){e.preventDefault();const first=$('#beauty-grid').querySelector('.beauty-card');if(first)first.focus();else{const i=$('#beauty-search-input');i.classList.remove('search-shake');void i.offsetWidth;i.classList.add('search-shake');}}
  });
  $('#beauty-load-more').addEventListener('click',()=>{visible+=24;renderItems()});
  $('#beauty-reset').addEventListener('click',()=>{primary='全部';secondary='全部';visible=24;$('#beauty-search-input').value='';renderAll();$('#beauty-search-input').focus();});
  $('.beauty-dialog .dialog-close').addEventListener('click',()=>$('#beauty-dialog').close());
  $('#beauty-dialog').addEventListener('click',e=>{if(e.target===$('#beauty-dialog'))$('#beauty-dialog').close()});
  $('#beauty-dialog').addEventListener('keydown',e=>{
    if (e.key!=='ArrowLeft' && e.key!=='ArrowRight') return;
    if (e.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    if (!beautyDialogNav || beautyDialogNav.list.length < 2) return;
    e.preventDefault();
    const dir = e.key==='ArrowRight' ? 1 : -1;
    beautyDialogNav.index = (beautyDialogNav.index + dir + beautyDialogNav.list.length) % beautyDialogNav.list.length;
    openItem(beautyDialogNav.list[beautyDialogNav.index]);
  });
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#beauty-search-input').focus()}});
  (function bindGridNav(){
    const grid=$('#beauty-grid');
    grid.addEventListener('keydown',e=>{
      if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
      const items=[...grid.querySelectorAll('.beauty-card')].filter(el=>el.offsetParent!==null);
      if(!items.length) return;
      const current=items.findIndex(el=>el.contains(e.target)||el===e.target);
      if(current<0) return;
      e.preventDefault();
      const cols=getComputedStyle(grid).gridTemplateColumns.split(' ').length||1;
      const total=items.length, rows=Math.ceil(total/cols);
      const row=Math.floor(current/cols), col=current%cols;
      let next;
      if(e.key==='ArrowRight') next=(current+1)%total;
      else if(e.key==='ArrowLeft') next=(current-1+total)%total;
      else if(e.key==='ArrowDown') next=Math.min(((row+1)%rows)*cols+col,total-1);
      else next=Math.min(((row-1+rows)%rows)*cols+col,total-1);
      items[next].focus();
    });
  })();
  renderAll();renderFoundation();openDeepLinkedItem();
})();
