(() => {
  const $=selector=>document.querySelector(selector);
  const FACE=window.FACE_ATLAS_DATA?.tags||[];
  const BODY=window.BODY_ATLAS_DATA?.tags||[];
  const BEAUTY=window.BEAUTY_ATLAS_DATA||{};
  const CONFIG=window.FACE_ATLAS_CREATE_CONFIG||{};
  const modes=[...$('#create-modes').querySelectorAll('button')];
  const DRAFT_KEY='face-atlas-creation-draft-v1';
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const unique=items=>[...new Set(items.map(item=>item.trim()).filter(Boolean))];
  const splitList=value=>unique(String(value||'').split(/[，,、;；\n]+/));
  const modeLabels={face:'单人面部人像',body:'单个成年人物全身研究参考图',makeup:'单人完整妆容人像',product:'单个美妆产品',nail:'一只手的完整美甲特写'};
  const defaultForbidden={
    face:'多余人物，多张脸，遮挡五官的手，文字，水印，Logo，面部结构错误，无关饰品',
    body:'多余人物，身体裁切，遮挡肩腰髋，夸张姿势，广角畸变，塑形服装，文字，水印，Logo',
    makeup:'多余人物，多张脸，遮挡妆容的手，文字，水印，Logo，未指定饰品，夸张滤镜',
    product:'多个产品，手持产品，人物，文字，水印，Logo，未指定道具，复杂背景',
    nail:'多余手指，缺失手指，畸形手部，戒指，手持产品，文字，水印，Logo，复杂背景'
  };
  let activeMode='face';
  let selected=[];
  let generationReady=false;
  let isGenerating=false;

  function generationEndpoint() {
    const raw=String(CONFIG.generationEndpoint||'').trim();
    if (!raw) return '';
    try {
      const url=new URL(raw,window.location.href);
      return url.protocol==='https:'||url.origin===window.location.origin ? url.href : '';
    } catch (_) { return ''; }
  }

  function record(group,item) {
    const secondary=item.part||item.family||item.category||item.dimension||item.kind||'';
    const search=[item.name,item.alias,item.en,item.keywords,item.definition,item.description,item.prompt,secondary].filter(Boolean).join(' ').toLocaleLowerCase();
    return {id:`${group}:${item.id}`,group,itemId:item.id,name:item.name,secondary,search,prompt:item.prompt||item.name};
  }

  function library() {
    if (activeMode==='face') return FACE.map(item=>record('face',item));
    if (activeMode==='body') return BODY.map(item=>record('body',item));
    if (activeMode==='makeup') return [
      ...(BEAUTY.styles||[]).map(item=>record('styles',item)),
      ...(BEAUTY.finishes||[]).map(item=>record('finishes',item)),
      ...(BEAUTY.shades||[]).map(item=>record('shades',item))
    ];
    if (activeMode==='product') return [
      ...(BEAUTY.products||[]).map(item=>record('products',item)),
      ...(BEAUTY.finishes||[]).map(item=>record('finishes',item)),
      ...(BEAUTY.shades||[]).map(item=>record('shades',item))
    ];
    return [...(BEAUTY.nails||[]).map(item=>record('nails',item)),...(BEAUTY.shades||[]).map(item=>record('shades',item))];
  }

  function groupName(group) {
    return {face:'面部',body:'身形',styles:'风格',finishes:'妆效',shades:'色号',products:'产品',nails:'美甲'}[group]||'标签';
  }

  function rank(item,query) {
    const name=item.name.toLocaleLowerCase();
    if (name===query) return 0;
    if (name.startsWith(query)) return 1;
    if (name.includes(query)) return 2;
    return 3;
  }

  function renderSuggestions() {
    const query=$('#tag-search').value.trim().toLocaleLowerCase();
    const records=library();
    $('#library-scope').textContent=`${records.length} 个可用标签`;
    const matches=(query ? records.filter(item=>item.search.includes(query)).sort((a,b)=>rank(a,query)-rank(b,query)) : records).filter(item=>!selected.some(value=>value.id===item.id)).slice(0,10);
    $('#tag-suggestions').innerHTML=matches.length ? matches.map(item=>`<button type="button" data-add-tag="${esc(item.id)}" title="${esc(item.secondary)}"><b>${esc(item.name)}</b> · ${esc(groupName(item.group))}</button>`).join('') : '<span>没有找到可添加的资料库标签。</span>';
  }

  function renderSelected() {
    $('#selected-tags').innerHTML=selected.length ? selected.map(item=>`<button type="button" data-remove-tag="${esc(item.id)}" aria-label="移除${esc(item.name)}">${esc(item.name)}</button>`).join('') : '<p>还没有添加资料库标签。</p>';
    renderSuggestions();
    compilePrompt();
  }

  function briefConstraints() {
    const clauses=String($('#brief-input').value||'').split(/[。！？!?；;\n]+/).flatMap(value=>value.split(/[，,]+/)).map(value=>value.trim()).filter(Boolean);
    const positive=[],negative=[];
    clauses.forEach(clause=>{
      if (/^(不要|禁止|避免|不得|无|不含)/.test(clause)) negative.push(clause.replace(/^(不要|禁止|避免|不得|无|不含)\s*/,'').trim());
      else positive.push(clause);
    });
    return {positive,negative};
  }

  function updateList(selector,items,emptyText) {
    $(selector).innerHTML=items.length ? items.map(item=>`<li>${esc(item)}</li>`).join('') : `<li>${esc(emptyText)}</li>`;
  }

  function renderPreflight(must,avoid,brief,exactEnabled,exactText) {
    const issues=[];
    const compact=value=>String(value).toLocaleLowerCase().replace(/\s+/g,'');
    const mustCompact=must.map(compact);
    const avoidCompact=avoid.map(compact);
    must.forEach((item,index)=>{
      const conflict=avoid.find((_,avoidIndex)=>mustCompact[index].length>1&&(mustCompact[index]===avoidCompact[avoidIndex]||mustCompact[index].includes(avoidCompact[avoidIndex])||avoidCompact[avoidIndex].includes(mustCompact[index])));
      if (conflict) issues.push({level:'alert',text:`“${item}”同时出现在必须和禁止要求中，请确认。`});
    });
    const nailShapes=selected.filter(item=>item.group==='nails'&&item.secondary==='甲型');
    if (activeMode==='nail'&&nailShapes.length>1) issues.push({level:'alert',text:`选择了多个甲型：${nailShapes.map(item=>item.name).join('、')}。可保留一个主甲型，其他写为局部变化。`});
    const productTypes=selected.filter(item=>item.group==='products');
    if (activeMode==='product'&&productTypes.length>1) issues.push({level:'warn',text:'单产品构图选择了多个产品类型，模型可能自行取舍。'});
    const allText=[brief,...must].join(' ');
    if (/(全哑光|柔焦哑光|雾面|磨砂)/.test(allText)&&/(镜面|水光|玻璃光|果冻|高光泽)/.test(allText)) issues.push({level:'warn',text:'同时出现哑光与高光泽要求，请说明分别作用于哪个部位。'});
    const hasGroup=group=>selected.some(item=>item.group===group);
    if (activeMode==='face') {
      if (selected.length<2&&brief.length<24) issues.push({level:'warn',text:'面部要求较少，建议至少补充脸型、眉眼、鼻唇或肤质中的两项。'});
    } else if (activeMode==='body') {
      if (!hasGroup('body')&&!/(身形|轮廓|肩|腰|髋|躯干|腿|手臂)/.test(allText)) issues.push({level:'warn',text:'尚未指定身形轮廓或比例标签。'});
      if (!/(全身|完整人物|从头到脚)/.test(allText)) issues.push({level:'warn',text:'建议明确“从头到脚完整入镜”，避免肩、腰、髋或四肢被裁切。'});
      if (!/(自然站立|正面站立|中性站姿)/.test(allText)) issues.push({level:'warn',text:'建议指定自然正面站立，减少姿势对比例的干扰。'});
    } else if (activeMode==='makeup') {
      if (!hasGroup('styles')&&!/(妆容|风格|妆感)/.test(allText)) issues.push({level:'warn',text:'尚未指定整体妆容风格。'});
      if (!hasGroup('shades')&&!/(红|粉|紫|棕|橘|裸|色系|色调)/.test(allText)) issues.push({level:'warn',text:'尚未指定主色或色调。'});
      if (!hasGroup('finishes')&&!/(哑光|水光|镜面|缎光|果冻|珠光|光泽)/.test(allText)) issues.push({level:'warn',text:'尚未指定皮肤或唇部妆效。'});
    } else if (activeMode==='product') {
      if (!hasGroup('products')&&!/(口红|唇釉|粉底|眼影|腮红|香水|产品|包装)/.test(allText)) issues.push({level:'warn',text:'尚未明确产品品类。'});
      if (!hasGroup('shades')&&!/(红|粉|紫|棕|橘|裸|黑|白|金|银|色)/.test(allText)) issues.push({level:'warn',text:'尚未指定产品或包装主色。'});
      if (exactEnabled&&!exactText) issues.push({level:'alert',text:'已开启精确文字，但还没有填写逐字内容。'});
    } else if (activeMode==='nail') {
      if (!nailShapes.length&&!/(圆形甲|椭圆甲|杏仁甲|方形甲|方圆甲|棺材甲|芭蕾甲|尖形甲)/.test(allText)) issues.push({level:'warn',text:'尚未指定甲型。'});
      if (!/(短甲|中短|中长|长甲|长度)/.test(allText)) issues.push({level:'warn',text:'尚未指定指甲长度。'});
      if (!hasGroup('shades')&&!/(红|粉|紫|棕|橘|裸|黑|白|蓝|绿|金|银|色)/.test(allText)) issues.push({level:'warn',text:'尚未指定美甲主色。'});
      if (!/(五指|完整手部|整只手|一只手)/.test(allText)) issues.push({level:'warn',text:'建议写明“一只手、五指完整”，降低漏指或裁切风险。'});
    }
    if (must.length>16) issues.push({level:'warn',text:'必须要求超过 16 项，建议保留核心特征，降低模型漏画概率。'});
    if (brief.length>600) issues.push({level:'warn',text:'原始描述较长，建议把最重要的要求移到“必须出现”。'});
    const alertCount=issues.filter(item=>item.level==='alert').length;
    const warnCount=issues.filter(item=>item.level==='warn').length;
    const hasRequest=Boolean(brief||must.length);
    const score=hasRequest?Math.max(20,100-alertCount*25-warnCount*8):0;
    $('#preflight-score').textContent=score;
    $('#preflight-level').textContent=!hasRequest?'等待要求':alertCount?'需要确认':warnCount>2?'建议补充':warnCount?'基本可用':'可以生成';
    $('#preflight-list').innerHTML=issues.length?issues.slice(0,6).map(item=>`<li data-level="${item.level}">${esc(item.text)}</li>`).join(''):`<li>${hasRequest?'没有发现明显冲突或关键遗漏。':'填写要求后自动检查容易漏画或互相冲突的内容。'}</li>`;
  }

  function renderResultReview(payload) {
    const core={face:['主体只有一人且五官完整','面部结构与左右关系自然'],body:['主体只有一人且从头到脚完整','肩、腰、髋与四肢比例符合要求'],makeup:['整体妆容风格匹配','妆效与指定部位反光一致'],product:['产品数量与品类正确','包装结构完整且没有伪文字'],nail:['一只手与五指结构完整','甲型、长度和各指设计正确']}[payload.mode];
    const items=unique([...core,...payload.constraints.must_include.slice(0,6),payload.constraints.do_not_include.length?'没有出现禁止项或多余背景元素':''].filter(Boolean));
    $('#result-review-items').innerHTML=items.map(item=>`<label><input type="checkbox"><span>${esc(item)}</span></label>`).join('');
    $('#review-progress').textContent=`0/${items.length}`;
    $('#result-review').hidden=false;
  }

  function compilePrompt() {
    const brief=$('#brief-input').value.trim();
    const parsed=briefConstraints();
    const must=unique([...selected.map(item=>item.name),...splitList($('#required-input').value),...parsed.positive]);
    const tagPrompts=unique(selected.map(item=>item.prompt));
    const exactEnabled=$('#exact-text-enabled').checked&&activeMode==='product';
    const exactText=$('#exact-text-input').value.trim();
    const rawAvoid=unique([...splitList($('#forbidden-input').value),...parsed.negative]);
    const avoid=exactEnabled?rawAvoid.filter(item=>item!=='文字'):rawAvoid;
    const settings=[$('#composition').value,$('#ratio').value,$('#background').value,$('#lighting').value];
    $('#must-count').textContent=must.length;
    $('#avoid-count').textContent=avoid.length;
    updateList('#must-list',must,'尚未指定');
    updateList('#avoid-list',avoid,'尚未指定');
    updateList('#setting-list',settings,'尚未设置');
    $('#exact-text-section').hidden=!exactEnabled;
    updateList('#exact-text-list',exactText?[`逐字内容：${exactText}`,'先生成无字包装与干净标签区域，再用排版层叠加文字']:['尚未输入需要准确呈现的文字']);

    const lines=[
      `Generate exactly one ${modeLabels[activeMode]}. Follow the requested description literally and do not invent extra objects.`,
      brief ? `PRIMARY REQUEST: ${brief}` : 'PRIMARY REQUEST: Build only from the structured requirements below.',
      `MUST INCLUDE: ${must.length?must.join('；'):'No additional attributes specified.'}`,
      `TAG SPECIFICATIONS:\n${tagPrompts.length?tagPrompts.map(item=>`- ${item}`).join('\n'):'- No library tags selected.'}`,
      `COMPOSITION: ${settings.join('；')}. Keep the requested subject complete and unobstructed.`,
      `DO NOT INCLUDE: ${avoid.length?avoid.join('；'):'Any unrequested object or decoration.'}`,
      'ACCURACY RULES: Preserve anatomy, symmetry, material response, requested colors and the exact number of visible subjects. Do not reinterpret the requested beauty terms.',
      exactEnabled ? `TEXT WORKFLOW: Generate a clean blank label area. Do not draw substitute text. Overlay the exact text “${exactText||'[请先输入文字]'}” with deterministic typography after image generation.` : 'TEXT RULE: Do not generate readable text, logos, watermarks or substitute lettering.',
      'FINAL CHECK: Before returning the image, remove every object, accessory, label and background detail that was not explicitly requested.'
    ];
    $('#compiled-prompt').value=lines.join('\n\n');
    const ready=Boolean(brief||selected.length||splitList($('#required-input').value).length);
    renderPreflight(must,avoid,brief,exactEnabled,exactText);
    generationReady=ready;
    updateGenerateButton();
    $('#interpret-number').textContent=ready?'03':'02';
    $('#interpret-heading').textContent=ready?'要求已结构化':'等待文字要求';
    $('#interpret-note').textContent=ready?`已整理 ${must.length} 项必须要求和 ${avoid.length} 项禁止要求，请在生成前核对。`:'输入描述或添加资料库标签后，这里会实时整理生成约束。';
  }

  function parseBrief() {
    const text=$('#brief-input').value.trim().toLocaleLowerCase();
    if (!text) { $('#creator-message').textContent='请先输入一段文字要求。'; return; }
    const found=library().filter(item=>{
      const forms=[item.name,item.name.replace(/(妆容|妆|甲|色)$/,''),...item.search.split(/\s+/).filter(value=>value.length>=2)];
      return forms.some(value=>value&&value!=='—'&&text.includes(value.toLocaleLowerCase()));
    }).filter((item,index,array)=>array.findIndex(value=>value.id===item.id)===index).slice(0,16);
    found.forEach(item=>{ if (!selected.some(value=>value.id===item.id)) selected.push(item); });
    $('#creator-message').textContent=found.length?`从文字中匹配到 ${found.length} 个资料库标签，请检查是否准确。`:'没有匹配到固定标签，原始描述仍会完整保留在 Prompt 中。';
    renderSelected();
  }

  function setMode(mode) {
    const previousDefault=defaultForbidden[activeMode];
    activeMode=mode;
    modes.forEach(button=>{
      const checked=button.dataset.mode===mode;
      button.setAttribute('aria-checked',String(checked));
      button.tabIndex=checked?0:-1;
    });
    selected=[];
    $('#tag-search').value='';
    if (!$('#forbidden-input').value.trim()||$('#forbidden-input').value===previousDefault) $('#forbidden-input').value=defaultForbidden[mode];
    const defaults={face:['正面半身人像','4:5','纯中性灰背景','中性柔光'],body:['正面全身研究图','3:4','纯中性灰背景','均匀影棚光'],makeup:['正面半身人像','4:5','柔和影棚背景','中性柔光'],product:['平铺产品图','1:1','纯白背景','均匀影棚光'],nail:['手部完整特写','4:5','纯中性灰背景','均匀影棚光']}[mode];
    [$('#composition').value,$('#ratio').value,$('#background').value,$('#lighting').value]=defaults;
    $('#text-control').hidden=mode!=='product';
    $('#creator-message').textContent='';
    resetGenerationResult();
    renderSelected();
  }

  function draft() {
    return {activeMode,brief:$('#brief-input').value,selected:selected.map(item=>item.id),composition:$('#composition').value,ratio:$('#ratio').value,background:$('#background').value,lighting:$('#lighting').value,required:$('#required-input').value,forbidden:$('#forbidden-input').value,exactEnabled:$('#exact-text-enabled').checked,exactText:$('#exact-text-input').value};
  }

  function updateGenerateButton() {
    const button=$('#generate-image');
    const connected=Boolean(generationEndpoint());
    button.disabled=isGenerating||!connected||!generationReady;
    button.textContent=isGenerating?'正在生成…':!connected?'生成服务待连接':!generationReady?'请先填写生成要求':'生成图片';
  }

  function setGenerationStatus(label,state='') {
    const status=$('#generation-status');
    status.textContent=label;
    if (state) status.dataset.state=state; else delete status.dataset.state;
  }

  function resetGenerationResult() {
    const connected=Boolean(generationEndpoint());
    $('#generation-empty').hidden=false;
    $('#generation-empty').querySelector('b').textContent=connected?'可以开始生成':'等待真实生成服务';
    $('#generation-empty').querySelector('p').textContent=connected?'核对上方系统理解，确认后生成图片。':'服务接入前这里只显示状态说明，不会展示示例图或伪造结果。';
    $('#generated-image').hidden=true;
    $('#generated-image').removeAttribute('src');
    $('#generation-detail').hidden=true;
    $('#generation-detail').textContent='';
    $('#result-review').hidden=true;
    $('#result-review-items').innerHTML='';
    $('#generation-result-actions').hidden=true;
    setGenerationStatus(connected?(CONFIG.providerLabel||'准备就绪'):'未连接');
  }

  function requestPayload() {
    const parsed=briefConstraints();
    const must=unique([...selected.map(item=>item.name),...splitList($('#required-input').value),...parsed.positive]);
    const avoid=unique([...splitList($('#forbidden-input').value),...parsed.negative]);
    return {
      mode:activeMode,
      brief:$('#brief-input').value.trim(),
      prompt:$('#compiled-prompt').value,
      library_tags:selected.map(item=>({id:item.id,name:item.name,group:item.group,prompt:item.prompt})),
      constraints:{must_include:must,do_not_include:avoid},
      settings:{composition:$('#composition').value,aspect_ratio:$('#ratio').value,background:$('#background').value,lighting:$('#lighting').value},
      exact_text:activeMode==='product'&&$('#exact-text-enabled').checked?$('#exact-text-input').value.trim():''
    };
  }

  function responseImage(data,endpoint) {
    const first=Array.isArray(data?.images)?data.images[0]:null;
    const candidate=data?.image_url||data?.image_data_url||first?.url||first?.data_url||(first?.b64_json?`data:image/png;base64,${first.b64_json}`:'');
    if (typeof candidate!=='string'||!candidate.trim()) return '';
    if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(candidate)) return candidate;
    try {
      const url=new URL(candidate,endpoint);
      return url.protocol==='https:'||url.origin===window.location.origin ? url.href : '';
    } catch (_) { return ''; }
  }

  async function runGeneration() {
    const endpoint=generationEndpoint();
    if (!endpoint) { $('#creator-message').textContent='真实生成服务尚未连接。'; return; }
    if (!generationReady||isGenerating) return;
    isGenerating=true;
    updateGenerateButton();
    setGenerationStatus('生成中','working');
    $('#generation-empty').hidden=false;
    $('#generation-empty').querySelector('b').textContent='正在按要求生成';
    $('#generation-empty').querySelector('p').textContent='复杂人像、手部和产品文字可能需要更长时间，请不要重复点击。';
    $('#generated-image').hidden=true;
    $('#generation-result-actions').hidden=true;
    $('#generation-detail').hidden=true;
    $('#creator-message').textContent='生成请求已发送。';
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),120000);
    const payload=requestPayload();
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      let data={};
      try { data=await response.json(); } catch (_) { /* handled below */ }
      if (!response.ok) throw new Error(data?.message||data?.error||`生成服务返回 ${response.status}`);
      const source=responseImage(data,endpoint);
      if (!source) throw new Error('生成服务没有返回可显示的图片');
      $('#generation-empty').hidden=true;
      const image=$('#generated-image');
      image.src=source;
      image.hidden=false;
      $('#download-image').href=source;
      $('#generation-result-actions').hidden=false;
      const detail=$('#generation-detail');
      const notes=[data?.provider?`生成服务：${data.provider}`:'',data?.revised_prompt?`模型修订：${data.revised_prompt}`:''].filter(Boolean);
      detail.textContent=notes.join(' · ');
      detail.hidden=!notes.length;
      renderResultReview(payload);
      setGenerationStatus('已完成','success');
      $('#creator-message').textContent='图片已生成。请核对指定特征，必要时可下载后送入识图实验室复核。';
    } catch (error) {
      $('#generation-empty').hidden=false;
      $('#generation-empty').querySelector('b').textContent='这次没有生成成功';
      $('#generation-empty').querySelector('p').textContent=error?.name==='AbortError'?'生成超过 120 秒，已停止等待。请稍后重试。':String(error?.message||'生成服务暂时不可用');
      setGenerationStatus('生成失败','error');
      $('#creator-message').textContent='没有产生图片，也不会显示替代结果。';
    } finally {
      clearTimeout(timer);
      isGenerating=false;
      updateGenerateButton();
    }
  }

  modes.forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
  $('#create-modes').addEventListener('keydown',event=>{
    const button=event.target.closest('button[role="radio"]');
    if(!button) return;
    const current=modes.indexOf(button);
    if(current<0) return;
    let next=-1;
    switch(event.key){
      case 'ArrowRight':
      case 'ArrowDown': next=(current+1)%modes.length; break;
      case 'ArrowLeft':
      case 'ArrowUp': next=(current-1+modes.length)%modes.length; break;
      case 'Home': next=0; break;
      case 'End': next=modes.length-1; break;
    }
    if(next>=0){event.preventDefault();modes[next].focus();setMode(modes[next].dataset.mode);}
  });
  $('#parse-brief').addEventListener('click',parseBrief);
  $('#tag-search').addEventListener('input',renderSuggestions);
  $('#tag-suggestions').addEventListener('click',event=>{
    const button=event.target.closest('[data-add-tag]'); if (!button) return;
    if (selected.length>=16) { $('#creator-message').textContent='最多选择 16 个核心标签，避免要求互相冲突。'; return; }
    const item=library().find(value=>value.id===button.dataset.addTag); if (item) selected.push(item);
    renderSelected();
  });
  $('#selected-tags').addEventListener('click',event=>{
    const button=event.target.closest('[data-remove-tag]'); if (!button) return;
    selected=selected.filter(item=>item.id!==button.dataset.removeTag); renderSelected();
  });
  $('#clear-tags').addEventListener('click',()=>{selected=[];renderSelected();});
  ['brief-input','required-input','forbidden-input','composition','ratio','background','lighting','exact-text-enabled','exact-text-input'].forEach(id=>$('#'+id).addEventListener('input',compilePrompt));
  $('#save-draft').addEventListener('click',()=>{
    try { localStorage.setItem(DRAFT_KEY,JSON.stringify(draft())); $('#creator-message').textContent='草稿已保存在当前浏览器。'; }
    catch (_) { $('#creator-message').textContent='浏览器未允许保存草稿。'; }
  });
  $('#restore-draft').addEventListener('click',()=>{
    let saved=null; try { saved=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null'); } catch (_) { /* ignore invalid local draft */ }
    if (!saved) { $('#creator-message').textContent='当前浏览器没有已保存的草稿。'; return; }
    setMode(saved.activeMode||'face');
    $('#brief-input').value=saved.brief||''; $('#required-input').value=saved.required||''; $('#forbidden-input').value=saved.forbidden||defaultForbidden[activeMode];
    ['composition','ratio','background','lighting'].forEach(id=>{ if (saved[id]) $('#'+id).value=saved[id]; });
    $('#exact-text-enabled').checked=Boolean(saved.exactEnabled); $('#exact-text-input').value=saved.exactText||'';
    const records=library(); selected=(saved.selected||[]).map(id=>records.find(item=>item.id===id)).filter(Boolean).slice(0,16);
    renderSelected(); $('#creator-message').textContent='已恢复本机草稿。';
  });
  $('#copy-prompt').addEventListener('click',async()=>{
    const value=$('#compiled-prompt').value;
    try { await navigator.clipboard.writeText(value); $('#creator-message').textContent='专业 Prompt 已复制。'; }
    catch (_) { $('#compiled-prompt').select(); document.execCommand('copy'); $('#creator-message').textContent='专业 Prompt 已复制。'; }
  });
  $('#generate-image').addEventListener('click',runGeneration);
  $('#regenerate-image').addEventListener('click',runGeneration);
  $('#result-review-items').addEventListener('change',()=>{
    const boxes=[...$('#result-review-items').querySelectorAll('input[type="checkbox"]')];
    $('#review-progress').textContent=`${boxes.filter(box=>box.checked).length}/${boxes.length}`;
  });
  setMode('face');
})();
