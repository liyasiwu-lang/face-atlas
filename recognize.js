const $ = selector => document.querySelector(selector);
const BEAUTY = window.BEAUTY_ATLAS_DATA || { shades: [] };
const BODY = window.BODY_ATLAS_DATA || { tags: [] };
const BODY_EXAMPLES = window.BODY_ATLAS_EXAMPLES || {};
const EXAMPLES = window.ATLAS_EXAMPLES || {};
const EXAMPLES_BY_ID = window.ATLAS_EXAMPLES_BY_ID || {};

const modes = [...$('#task-modes').querySelectorAll('button')];
const input = $('#image-input');
const drop = $('#drop-zone');
const previewWrap = $('#preview-wrap');
const preview = $('#image-preview');
const imageStage = $('#image-stage');
const focusBox = $('#focus-box');
const focusTools = $('#focus-tools');
const focusToggle = $('#focus-toggle');
const focusReset = $('#focus-reset');
const focusStatus = $('#focus-status');
const analyzeButton = $('#show-demo');
const error = $('#upload-error');
const photoGuideTitle = $('#photo-guide-title');
const photoGuideText = $('#photo-guide-text');
let activeMode = 'face';
let objectURL = '';
let currentFile = null;
let faceLandmarkerPromise = null;
let handLandmarkerPromise = null;
let focusCrop = null;
let focusDraft = null;
let focusStart = null;
let focusEnabled = false;
let analysisRunId = 0;
let currentAnalysisMeta = null;
let sessionCorrections = [];
let currentComparisonArticle = null;
const atlasImageCache = new Map();
const FEEDBACK_KEY = 'face-atlas-feedback-v1';
const CALIBRATION_KEY = 'face-atlas-calibration-v1';
const HISTORY_KEY = 'face-atlas-history-v1';
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 36_000_000;
const MAX_ANALYSIS_DIMENSION = 1600;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const formatBytes = bytes => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const hex = rgb => `#${rgb.map(value => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  const l = (max + min) / 2;
  const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;
  return [h, s || 0, l];
}

function rgbToLab([r, g, b]) {
  const linear = value => {
    value /= 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  r = linear(r); g = linear(g); b = linear(b);
  const x = (r * .4124 + g * .3576 + b * .1805) / .95047;
  const y = (r * .2126 + g * .7152 + b * .0722);
  const z = (r * .0193 + g * .1192 + b * .9505) / 1.08883;
  const f = value => value > .008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function parseHex(value) {
  const clean = String(value || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return [128, 128, 128];
  return [0, 2, 4].map(index => parseInt(clean.slice(index, index + 2), 16));
}

function nearestShade(rgb, mode) {
  const source = (BEAUTY.shades || []).filter(item => {
    if (!Array.isArray(item.applies)) return true;
    if (mode === 'nail') return item.applies.some(value => /甲|美甲/.test(value));
    if (mode === 'makeup') return item.applies.some(value => /唇|眼|腮红|底妆|高光/.test(value));
    return true;
  });
  const target = rgbToLab(rgb);
  let best = null;
  source.forEach(item => {
    const lab = rgbToLab(parseHex(item.hex));
    const distance = Math.hypot(target[0] - lab[0], target[1] - lab[1], target[2] - lab[2]);
    if (!best || distance < best.distance) best = { item, distance };
  });
  return best;
}

function analyzePixels(image, crop = null) {
  const canvas = document.createElement('canvas');
  const sourceW = image.naturalWidth || image.width;
  const sourceH = image.naturalHeight || image.height;
  const sx = crop ? clamp(crop.x, 0, 1) * sourceW : 0;
  const sy = crop ? clamp(crop.y, 0, 1) * sourceH : 0;
  const sw = crop ? clamp(crop.width, .02, 1 - crop.x) * sourceW : sourceW;
  const sh = crop ? clamp(crop.height, .02, 1 - crop.y) * sourceH : sourceH;
  const scale = Math.min(1, 560 / Math.max(sw, sh));
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const corners = [[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]];
  const cornerRgb = [0, 1, 2].map(channel => corners.reduce((sum, [x,y]) => sum + data[(y * canvas.width + x) * 4 + channel], 0) / corners.length);
  const cornerSpread = Math.max(...corners.map(([x,y])=>{
    const index=(y*canvas.width+x)*4;
    return Math.hypot(data[index]-cornerRgb[0],data[index+1]-cornerRgb[1],data[index+2]-cornerRgb[2]);
  }));
  const cornerStable=cornerSpread<48;
  const hueBins = new Array(24).fill(0);
  const samples = [];
  const foreground = [];
  let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;

  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const index = (y * canvas.width + x) * 4;
      if (data[index + 3] < 32) continue;
      const rgb = [data[index], data[index + 1], data[index + 2]];
      const distance = Math.hypot(rgb[0] - cornerRgb[0], rgb[1] - cornerRgb[1], rgb[2] - cornerRgb[2]);
      const isForeground = cornerStable && distance > 34;
      const record = { rgb, x, y };
      samples.push(record);
      if (isForeground) {
        foreground.push(record);
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  }
  const usable = foreground.length > samples.length * .025 ? foreground : samples;
  const sums = [0,0,0];
  let saturation = 0, luma = 0, luma2 = 0, highlights = 0, specular = 0, dark = 0;
  const usableLumas = [];
  usable.forEach(({ rgb }) => {
    sums[0] += rgb[0]; sums[1] += rgb[1]; sums[2] += rgb[2];
    const [h, s, light] = rgbToHsl(...rgb);
    const lum = (.299 * rgb[0] + .587 * rgb[1] + .114 * rgb[2]) / 255;
    usableLumas.push(lum);
    saturation += s; luma += lum; luma2 += lum * lum;
    if (lum > .84) highlights++;
    if (lum > .9 && s < .18) specular++;
    if (lum < .22) dark++;
    if (s > .14 && light > .08 && light < .94) hueBins[Math.floor(h / 15) % 24] += s;
  });
  const count = Math.max(1, usable.length);
  const meanLuma = luma / count;
  usableLumas.sort((a,b)=>a-b);
  const percentile = value => usableLumas[Math.min(usableLumas.length - 1, Math.max(0, Math.round((usableLumas.length - 1) * value)))] || 0;
  const medianLuma = percentile(.5), peakLuma = percentile(.98);
  const relativeHighlightRatio = usableLumas.filter(value => value > medianLuma + .14).length / count;
  const relativeHighlights=usable.filter(({rgb})=>(.299*rgb[0]+.587*rgb[1]+.114*rgb[2])/255>medianLuma+.14);
  const highlightBounds=relativeHighlights.reduce((bounds,item)=>({
    minX:Math.min(bounds.minX,item.x),maxX:Math.max(bounds.maxX,item.x),
    minY:Math.min(bounds.minY,item.y),maxY:Math.max(bounds.maxY,item.y)
  }),{minX:canvas.width,maxX:0,minY:canvas.height,maxY:0});
  const highlightWidth=Math.max(1,highlightBounds.maxX-highlightBounds.minX+1);
  const highlightHeight=Math.max(1,highlightBounds.maxY-highlightBounds.minY+1);
  const highlightElongation=relativeHighlights.length ? Math.max(highlightWidth/highlightHeight,highlightHeight/highlightWidth) : 1;
  const maxHue = Math.max(...hueBins);
  const activeHueBins = maxHue ? hueBins.filter(value => value > maxHue * .12).length : 0;

  let edges = 0, comparisons = 0;
  const gray = (x, y) => {
    const index = (y * canvas.width + x) * 4;
    return .299 * data[index] + .587 * data[index + 1] + .114 * data[index + 2];
  };
  for (let y = 2; y < canvas.height - 2; y += 4) {
    for (let x = 2; x < canvas.width - 2; x += 4) {
      const gradient = Math.abs(gray(x + 2, y) - gray(x - 2, y)) + Math.abs(gray(x, y + 2) - gray(x, y - 2));
      if (gradient > 42) edges++;
      comparisons++;
    }
  }
  const bboxValid = foreground.length > samples.length * .025;
  const bbox = bboxValid ? {
    x: minX / canvas.width, y: minY / canvas.height,
    width: (maxX - minX + 1) / canvas.width, height: (maxY - minY + 1) / canvas.height
  } : { x:0, y:0, width:1, height:1 };
  return {
    rgb: sums.map(value => value / count), color: hex(sums.map(value => value / count)),
    saturation: saturation / count, luma: meanLuma,
    contrast: Math.sqrt(Math.max(0, luma2 / count - meanLuma ** 2)),
    highlightRatio: highlights / count, specularRatio: specular / count, darkRatio: dark / count,
    medianLuma, peakLuma, peakLift:peakLuma-medianLuma, relativeHighlightRatio, highlightElongation,
    edgeDensity: edges / Math.max(1, comparisons), hueSpread: activeHueBins,
    foregroundRatio: foreground.length / Math.max(1, samples.length), bbox,
    aspect: bbox.height / Math.max(.01, bbox.width)
  };
}

function analysisSource() {
  const canvas=document.createElement('canvas');
  const sourceW=preview.naturalWidth, sourceH=preview.naturalHeight;
  const crop=focusCrop||{x:0,y:0,width:1,height:1};
  const cropW=sourceW*crop.width,cropH=sourceH*crop.height;
  const scale=Math.min(1,MAX_ANALYSIS_DIMENSION/Math.max(cropW,cropH));
  canvas.width=Math.max(64,Math.round(cropW*scale));
  canvas.height=Math.max(64,Math.round(cropH*scale));
  canvas.getContext('2d').drawImage(
    preview,
    crop.x*sourceW,crop.y*sourceH,crop.width*sourceW,crop.height*sourceH,
    0,0,canvas.width,canvas.height
  );
  return canvas;
}

function centralSubjectProfile(image) {
  const initial=analyzePixels(image);
  const box=initial.bbox;
  const valid=initial.foregroundRatio>.035 && initial.foregroundRatio<.86 && box.width<.94 && box.height<.94;
  const touchesEdge=box.x<.02 || box.y<.02 || box.x+box.width>.98 || box.y+box.height>.98;
  if (!valid) return {profile:initial,localized:false,touchesEdge,backgroundRisk:true};
  const padX=box.width*.06, padY=box.height*.06;
  const crop={
    x:clamp(box.x-padX,0,.98), y:clamp(box.y-padY,0,.98),
    width:clamp(box.width+padX*2,.02,1), height:clamp(box.height+padY*2,.02,1)
  };
  return {profile:analyzePixels(image,crop),localized:true,touchesEdge,backgroundRisk:initial.hueSpread>10 || initial.edgeDensity>.23};
}

function bodySilhouetteProfile(image) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 420 / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently:true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const corners = [[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]];
  const background = [0,1,2].map(channel => corners.reduce((sum,[x,y]) => sum + pixels[(y*canvas.width+x)*4+channel],0)/corners.length);
  const cornerSpread = Math.max(...corners.map(([x,y]) => {
    const index=(y*canvas.width+x)*4;
    return Math.hypot(pixels[index]-background[0],pixels[index+1]-background[1],pixels[index+2]-background[2]);
  }));
  if (cornerSpread > 52) return null;

  const rows = [];
  let minY = canvas.height, maxY = 0, minX = canvas.width, maxX = 0;
  for (let y=0;y<canvas.height;y++) {
    let left=canvas.width,right=-1,count=0;
    for (let x=0;x<canvas.width;x++) {
      const index=(y*canvas.width+x)*4;
      const distance=Math.hypot(pixels[index]-background[0],pixels[index+1]-background[1],pixels[index+2]-background[2]);
      if (pixels[index+3]>32 && distance>38) {
        left=Math.min(left,x); right=Math.max(right,x); count++;
      }
    }
    rows.push(count>2 ? {left,right,width:right-left+1,count} : null);
    if (count>2) { minY=Math.min(minY,y); maxY=Math.max(maxY,y); minX=Math.min(minX,left); maxX=Math.max(maxX,right); }
  }
  const height=maxY-minY+1,width=maxX-minX+1;
  if (height<canvas.height*.55 || height/Math.max(1,width)<1.35) return null;
  const medianWidth = (from,to) => {
    const values=[];
    const start=Math.round(minY+height*from),end=Math.round(minY+height*to);
    for (let y=start;y<=end;y++) if (rows[y]) values.push(rows[y].width);
    values.sort((a,b)=>a-b);
    return values.length ? values[Math.floor(values.length/2)] : 0;
  };
  const shoulder=medianWidth(.19,.30);
  const waist=medianWidth(.38,.47);
  const hip=medianWidth(.48,.60);
  if (!shoulder || !waist || !hip) return null;
  return {
    shoulder,waist,hip,
    shoulderHip:shoulder/hip,
    waistRatio:waist/Math.max(shoulder,hip),
    bodyAspect:height/width,
    bounds:{x:minX/canvas.width,y:minY/canvas.height,width:width/canvas.width,height:height/canvas.height}
  };
}

function bodyCandidates(metrics, quality) {
  const candidates=[];
  const ceiling=Math.min(68,quality-8);
  const add=(name,score,evidence)=>candidates.push(tag(name,Math.min(ceiling,score),evidence,'body'));
  const shoulderHip=metrics.shoulderHip,waistRatio=metrics.waistRatio;
  if (shoulderHip>1.1) {
    add('肩宽于髋',64,`轮廓估计的肩部/髋部可见宽度约 ${shoulderHip.toFixed(2)}。`);
    add('V形轮廓',58,'上段轮廓宽于髋部，腰部以下整体向内收窄。');
  } else if (shoulderHip<.9) {
    add('肩窄于髋',64,`轮廓估计的肩部/髋部可见宽度约 ${shoulderHip.toFixed(2)}。`);
    add('A形轮廓',58,'髋部可见宽度高于肩部，轮廓重心更多落在下半身。');
  } else {
    add('肩髋等宽',62,`轮廓估计的肩部/髋部可见宽度约 ${shoulderHip.toFixed(2)}，处于接近区间。`);
    if (waistRatio<.73) add('X形轮廓',60,`腰部/肩髋最大宽度约 ${waistRatio.toFixed(2)}，可见稳定内收。`);
    else if (waistRatio<.84) add('柔和X形轮廓',57,`腰部/肩髋最大宽度约 ${waistRatio.toFixed(2)}，存在中等内收。`);
    else add(metrics.bodyAspect>3.35?'I形轮廓':'H形轮廓',57,`腰部/肩髋最大宽度约 ${waistRatio.toFixed(2)}，躯干两侧对比较小。`);
  }
  return candidates;
}

function qualityAssessment(profile) {
  let score = 88;
  const notes = [];
  if (profile.luma > .84) { score -= 18; notes.push('整体偏亮或局部过曝，浅色与高光判断可能被放大'); }
  if (profile.luma < .18) { score -= 20; notes.push('整体偏暗，颜色与轮廓细节不足'); }
  if (profile.contrast < .07) { score -= 12; notes.push('图像对比较低，相邻色与边缘不易区分'); }
  if (profile.foregroundRatio < .025) { score -= 18; notes.push('主体在画面中占比较小'); }
  if (profile.specularRatio > .28) { score -= 10; notes.push('强反光面积较大，可能影响真实颜色'); }
  return { score: clamp(Math.round(score), 38, 92), notes };
}

function confidence(score) {
  if (score >= 75) return { level:'high', label:'较高' };
  if (score >= 55) return { level:'medium', label:'中等' };
  return { level:'low', label:'较低' };
}

function referenceId(group,key) {
  if (group==='body') return BODY.tags.find(item=>item.name===key)?.id||null;
  return (BEAUTY[group]||[]).find(item=>item.name===key)?.id||null;
}

function tag(name, score, evidence, group, key = name) {
  return { name, score: clamp(Math.round(score), 1, 99), evidence, group, key, refId:referenceId(group,key) };
}

function regionCanvas(image, points, indices, padding = .08) {
  const sourceW = image.naturalWidth || image.width, sourceH = image.naturalHeight || image.height;
  const xs = indices.map(index => points[index].x), ys = indices.map(index => points[index].y);
  const minX = Math.max(0, Math.min(...xs) - padding), maxX = Math.min(1, Math.max(...xs) + padding);
  const minY = Math.max(0, Math.min(...ys) - padding), maxY = Math.min(1, Math.max(...ys) + padding);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(64, Math.round((maxX - minX) * sourceW));
  canvas.height = Math.max(48, Math.round((maxY - minY) * sourceH));
  const ctx = canvas.getContext('2d', { willReadFrequently:true });
  ctx.drawImage(image, minX * sourceW, minY * sourceH, (maxX-minX) * sourceW, (maxY-minY) * sourceH, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  indices.forEach((index, i) => {
    const x = (points[index].x - minX) / (maxX-minX) * canvas.width;
    const y = (points[index].y - minY) / (maxY-minY) * canvas.height;
    if (i) ctx.lineTo(x,y); else ctx.moveTo(x,y);
  });
  ctx.closePath(); ctx.fill();
  return canvas;
}

function lipProfile(points, image) {
  const outerLip = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
  return analyzePixels(regionCanvas(image, points, outerLip, .035));
}

function averageProfiles(profiles) {
  if (!profiles.length) return null;
  const numeric = ['saturation','luma','contrast','highlightRatio','specularRatio','darkRatio','edgeDensity','hueSpread','foregroundRatio','aspect','medianLuma','peakLuma','peakLift','relativeHighlightRatio','highlightElongation','distalRatio'];
  const rgb = [0,1,2].map(channel => profiles.reduce((sum,p)=>sum+p.rgb[channel],0)/profiles.length);
  const result = {
    rgb,
    color:hex(rgb),
    bbox:{x:0,y:0,width:1,height:1},
    nailCount:profiles.reduce((sum,profile)=>sum+(profile.nailCount||1),0),
    lightBandVotes:profiles.reduce((sum,profile)=>sum+(profile.lightBandVotes??(profile.lightBand?1:0)),0),
    maxEdgeDensity:Math.max(...profiles.map(profile=>profile.edgeDensity||0))
  };
  numeric.forEach(key => result[key] = profiles.reduce((sum,p)=>sum+(p[key]||0),0)/profiles.length);
  return result;
}

function robustCanvasColor(canvas) {
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
  const samples=[];
  const minX=Math.round(canvas.width*.16),maxX=Math.round(canvas.width*.84);
  const minY=Math.round(canvas.height*.08),maxY=Math.round(canvas.height*.78);
  for (let y=minY;y<maxY;y+=2) {
    for (let x=minX;x<maxX;x+=2) {
      const index=(y*canvas.width+x)*4;
      if (data[index+3]<32) continue;
      const rgb=[data[index],data[index+1],data[index+2]];
      samples.push({rgb,luma:(.299*rgb[0]+.587*rgb[1]+.114*rgb[2])/255});
    }
  }
  if (!samples.length) return [128,128,128];
  samples.sort((a,b)=>a.luma-b.luma);
  const usable=samples.slice(Math.floor(samples.length*.14),Math.max(1,Math.ceil(samples.length*.78)));
  return [0,1,2].map(channel=>{
    const values=usable.map(sample=>sample.rgb[channel]).sort((a,b)=>a-b);
    return values[Math.floor(values.length/2)]||128;
  });
}

function nailRegionCanvas(image,tip,dip) {
  const sourceW=image.naturalWidth||image.width, sourceH=image.naturalHeight||image.height;
  const vx=(dip.x-tip.x)*sourceW,vy=(dip.y-tip.y)*sourceH;
  const length=Math.max(18,Math.hypot(vx,vy));
  const width=Math.max(14,length*.48),height=Math.max(20,length*.68);
  const cx=tip.x*sourceW+vx*.18,cy=tip.y*sourceH+vy*.18;
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(width);canvas.height=Math.round(height);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.translate(canvas.width/2,canvas.height/2);
  ctx.rotate(Math.PI/2-Math.atan2(vy,vx));
  ctx.drawImage(image,-cx,-cy);
  return canvas;
}

function nailProfileFromHand(points, image) {
  const sourceW=image.naturalWidth||image.width, sourceH=image.naturalHeight||image.height;
  const distance=(a,b)=>Math.hypot((a.x-b.x)*sourceW,(a.y-b.y)*sourceH);
  const pairs=[[4,3,2],[8,7,6],[12,11,10],[16,15,14],[20,19,18]];
  const profiles=pairs.map(([tipIndex,dipIndex,pipIndex])=>{
    const tip=points[tipIndex], dip=points[dipIndex], pip=points[pipIndex];
    const canvas=nailRegionCanvas(image,tip,dip);
    const profile=analyzePixels(canvas);
    profile.rgb=robustCanvasColor(canvas);
    profile.color=hex(profile.rgb);
    profile.distalRatio=distance(tip,dip)/Math.max(1,distance(dip,pip));
    profile.lightBand=(
      profile.relativeHighlightRatio>.012 &&
      profile.highlightElongation>1.35 &&
      profile.peakLift>.12 &&
      profile.contrast>.07
    );
    return profile;
  }).filter(profile=>profile.foregroundRatio>.015);
  return averageProfiles(profiles);
}

function highlightBandEvidence(image) {
  const sourceW=image.naturalWidth||image.width,sourceH=image.naturalHeight||image.height;
  const scale=Math.min(1,360/Math.max(sourceW,sourceH));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(64,Math.round(sourceW*scale));
  canvas.height=Math.max(64,Math.round(sourceH*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
  const total=canvas.width*canvas.height,lumas=new Array(total);
  for (let index=0;index<total;index++) {
    const offset=index*4;
    lumas[index]=(.299*data[offset]+.587*data[offset+1]+.114*data[offset+2])/255;
  }
  const sorted=[...lumas].sort((a,b)=>a-b);
  const median=sorted[Math.floor(sorted.length*.5)]||0;
  const threshold=Math.min(.92,median+.16);
  const mask=new Uint8Array(total),visited=new Uint8Array(total);
  for (let index=0;index<total;index++) mask[index]=lumas[index]>threshold?1:0;
  let bands=0;
  const bandPixels=[];
  for (let start=0;start<total;start++) {
    if (!mask[start]||visited[start]) continue;
    const stack=[start];visited[start]=1;
    const members=[];
    let count=0,minX=canvas.width,maxX=0,minY=canvas.height,maxY=0,touchesEdge=false;
    while (stack.length) {
      const index=stack.pop(),x=index%canvas.width,y=Math.floor(index/canvas.width);
      members.push(index);
      count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      if (x<2||y<2||x>canvas.width-3||y>canvas.height-3) touchesEdge=true;
      for (const next of [index-1,index+1,index-canvas.width,index+canvas.width]) {
        if (next<0||next>=total||visited[next]||!mask[next]) continue;
        const nextX=next%canvas.width;
        if (Math.abs(nextX-x)>1) continue;
        visited[next]=1;stack.push(next);
      }
    }
    const width=maxX-minX+1,height=maxY-minY+1,elongation=Math.max(width/Math.max(1,height),height/Math.max(1,width));
    const fill=count/Math.max(1,width*height);
    if (!touchesEdge&&count>=10&&count<total*.04&&elongation>1.75&&fill>.12) {
      bands++;
      bandPixels.push(...members);
    }
  }
  const nearby=new Set();
  const maxBaseLuma=Math.min(.82,threshold-.04);
  bandPixels.forEach((index,position)=>{
    if (position%3) return;
    const x=index%canvas.width,y=Math.floor(index/canvas.width);
    for (let dy=-7;dy<=7;dy+=2) {
      for (let dx=-7;dx<=7;dx+=2) {
        const px=x+dx,py=y+dy;
        if (px<0||py<0||px>=canvas.width||py>=canvas.height) continue;
        const nearbyIndex=py*canvas.width+px;
        if (lumas[nearbyIndex]>.05&&lumas[nearbyIndex]<maxBaseLuma) nearby.add(nearbyIndex);
      }
    }
  });
  const colorSamples=[...nearby].map(index=>{
    const offset=index*4;
    return [data[offset],data[offset+1],data[offset+2]];
  });
  const rgb=colorSamples.length>24?[0,1,2].map(channel=>{
    const values=colorSamples.map(sample=>sample[channel]).sort((a,b)=>a-b);
    return values[Math.floor(values.length/2)];
  }):null;
  return {count:bands,rgb};
}

function lipFinishCandidates(profile, quality) {
  const strongGloss = profile.specularRatio > .035 || (profile.highlightRatio > .12 && profile.contrast > .12) || (profile.peakLift > .27 && profile.relativeHighlightRatio > .025);
  const visibleGloss = strongGloss || profile.specularRatio > .009 || profile.highlightRatio > .055 || (profile.peakLift > .18 && profile.relativeHighlightRatio > .015);
  if (strongGloss) return [
    tag('镜面', Math.min(84,quality-2), '唇色内部存在明显亮度跃升和集中高光带，属于高光泽镜面候选。', 'finishes'),
    tag('水光', Math.min(81,quality-5), '唇部连续湿润反射明显，不再要求高光必须接近纯白。', 'finishes'),
    tag('果冻', Math.min(77,quality-8), '色膜呈通透、饱满并伴随集中高光，候选接近果冻唇。', 'finishes'),
    tag('高光唇釉', Math.min(74,quality-11), '高显色液态色膜与镜面反光同时出现，产品形态优先匹配唇釉。', 'products', '唇釉')
  ];
  if (visibleGloss) return [
    tag('水光', Math.min(78,quality-7), '唇部局部高光连续，反射强度高于自然唇面。', 'finishes'),
    tag('果冻', Math.min(70,quality-13), '半透明色感与湿润反光同时出现。', 'finishes'),
    tag('高光唇釉', Math.min(67,quality-16), '可见液态亮泽色膜，唇釉作为相关产品候选。', 'products', '唇釉')
  ];
  if (profile.specularRatio < .006 && profile.highlightRatio < .035 && profile.peakLift < .15 && profile.contrast < .12) return [
    tag('柔焦哑光', Math.min(76,quality-9), '唇部区域几乎没有集中高光，色膜反射均匀。', 'finishes')
  ];
  return [tag('自然妆效',Math.min(67,quality-16),'唇部仅有轻微自然反光，未达到镜面或全哑光特征。','finishes')];
}

function finishCandidate(profile, scoreBase = 66) {
  if (profile.specularRatio > .13 && profile.highlightRatio > .18) return tag('镜面', scoreBase, '高亮近白区域集中且反射边界清晰。', 'finishes');
  if (profile.highlightRatio > .16 && profile.contrast > .16) return tag('水光', scoreBase, '亮部比例较高，并保留连续湿润反光。', 'finishes');
  if (profile.hueSpread >= 7 && profile.edgeDensity > .12) return tag('全息', scoreBase - 5, '画面中出现多个明显色相和密集反射细节。', 'finishes');
  if (profile.edgeDensity > .2 && profile.highlightRatio > .08) return tag('细闪', scoreBase - 4, '高频细节与分散亮点同时出现。', 'finishes');
  if (profile.specularRatio < .025 && profile.highlightRatio < .08) return tag('全哑光', scoreBase, '近白镜面反光很少，表面以漫反射为主。', 'finishes');
  if (profile.contrast < .13) return tag('柔焦哑光', scoreBase - 2, '局部对比较低，亮部边界柔和。', 'finishes');
  return tag('自然妆效', scoreBase - 6, '反光与漫反射较均衡，没有单一强烈妆效占主导。', 'finishes');
}

function productCandidates(profile, quality) {
  const [h, s, l] = rgbToHsl(...profile.rgb);
  const tall = profile.aspect > 1.55;
  if (profile.darkRatio > .42 && tall) return [
    tag('纤长睫毛膏', Math.min(57, quality - 22), '主体轮廓偏细长且深色区域占比较高，可先归入睫毛膏类；具体功效仍需包装信息。', 'products'),
    tag('眼线液笔', Math.min(49, quality - 28), '细长深色外形也可能对应笔状眼线产品。', 'products')
  ];
  if ((h < 25 || h > 325) && s > .22 && tall) {
    const glossy = profile.specularRatio > .055 || profile.highlightRatio > .17;
    return [
      tag(glossy ? '唇釉' : '液体口红', Math.min(63, quality - 15), `主体呈细长包装轮廓，代表色偏${h < 15 || h > 345 ? '红' : '暖红棕'}，${glossy ? '反光较明显' : '反光较克制'}。`, 'products'),
      tag(glossy ? '唇油' : '传统口红', Math.min(47, quality - 29), '仅凭外轮廓与颜色无法确认具体唇部剂型。', 'products')
    ];
  }
  const beige = h > 15 && h < 55 && s < .42 && l > .28 && l < .84;
  if (beige) return [
    tag('粉底液', Math.min(59, quality - 19), '主体颜色接近肤色液态底妆常见区间，包装轮廓未显示明显彩色装饰。', 'products'),
    tag('液体腮红', Math.min(41, quality - 34), '若实物带暖粉色，也可能是液体面颊产品。', 'products')
  ];
  if (profile.aspect < 1.25) return [
    tag(s > .28 ? '粉状腮红' : '粉饼粉底', Math.min(55, quality - 23), '主体外接轮廓接近粉盒或压盘类产品。', 'products'),
    tag('粉状高光', Math.min(39, quality - 37), '圆盘或方盘外形无法单独区分腮红、粉饼与高光。', 'products')
  ];
  return [
    tag('液体口红', Math.min(44, quality - 31), '当前只检测到通用细长容器特征，产品品类证据有限。', 'products'),
    tag('粉底液', Math.min(38, quality - 37), '容器、泵头或刷头不可见时无法稳定区分剂型。', 'products')
  ];
}

function makeupStyleCandidates(profile, lips, quality) {
  const candidates=[];
  const add=(name,score,evidence)=>candidates.push(tag(name,Math.min(78,score),evidence,'styles'));
  const lipGloss = lips.peakLift > .18 || lips.highlightRatio > .055 || lips.specularRatio > .009;
  const [h,s] = rgbToHsl(...profile.rgb);

  if (lipGloss) {
    add('水光妆', quality-5, '唇部有连续高光，面部同时保留通透亮泽，优先匹配水光妆。');
    add('韩系清透妆', quality-9, '纤长睫毛、柔和腮红与水光唇的组合接近韩系清透妆。');
    add('玻璃肌妆容', quality-(profile.highlightRatio>.11 ? 8 : 17), '面中亮泽和镜面唇共同形成通透反光，候选接近玻璃肌妆容。');
    add('日系透明感妆', quality-16, '通透底妆与亮泽唇也可能对应日系透明感妆，作为延伸候选。');
  }
  if (s < .34) add('清透裸妆', quality-14, '整体色彩轻柔、对比克制，可作为清透裸妆候选。');
  if ((h < 38 || h > 345) && s > .18) add('桃色妆容', quality-15, '腮红与唇色处于暖粉至蜜桃区间，具有同色系妆容特征。');
  if (!lipGloss && profile.darkRatio > .27 && profile.contrast > .22) add('小烟熏', quality-10, '深色区域占比和局部明暗对比较高。');
  if (!lipGloss && profile.saturation > .42 && profile.hueSpread >= 5) add('编辑妆', quality-12, '色彩饱和度较高，并出现多个明显色相。');
  if (!lipGloss && profile.highlightRatio < .1) add('柔雾通勤妆', quality-15, '整体反光较克制、边界整洁，作为柔雾通勤妆候选。');
  return candidates.sort((a,b)=>b.score-a.score).slice(0,5);
}

function makeupAppearanceCandidates(profile,quality) {
  const candidates=[];
  const add=(name,score,evidence)=>candidates.push(tag(name,Math.min(55,score),evidence,'styles'));
  const [h,s]=rgbToHsl(...profile.rgb);
  if (profile.highlightRatio>.1 && profile.contrast>.11) add('水光妆',quality-28,'主体区域存在较明显亮泽，水光妆仅作为低置信度整体候选。');
  if (s<.36) add('清透裸妆',quality-30,'整体色彩柔和、饱和度较低，候选接近清透裸妆。');
  if ((h<40||h>345) && s>.18) add('桃色妆容',quality-32,'主体代表色位于暖粉至蜜桃区间，桃色妆容作为相关候选。');
  if (profile.darkRatio>.27 && profile.contrast>.2) add('小烟熏',quality-30,'主体包含较集中的深色高对比区域，小烟熏作为相关候选。');
  if (!candidates.length) add('清透裸妆',quality-38,'当前只获得整体色彩与明暗，先保留最接近的低置信度风格候选。');
  return candidates.sort((a,b)=>b.score-a.score).slice(0,3);
}

function nailEffectCandidates(profile, quality, localized = true) {
  const ceiling = localized ? 78 : 64;
  const candidates = [];
  const add = (name, rawScore, evidence) => candidates.push(tag(name, Math.min(ceiling, rawScore), evidence, 'nails'));
  const hasVisibleGloss = profile.highlightRatio > .055 || profile.specularRatio > .008;
  const requiredVotes=localized ? Math.max(1,Math.ceil((profile.nailCount||1)*.4)) : 2;
  const hasLightBand=(profile.lightBandVotes||0)>=requiredVotes || (
    profile.relativeHighlightRatio>.015 &&
    profile.highlightElongation>1.45 &&
    profile.peakLift>.14 &&
    profile.contrast>.08
  );
  const strongMirror=profile.specularRatio>.12&&profile.highlightRatio>.17;
  const multiColorReflection=profile.hueSpread>=7&&profile.highlightRatio>.1;

  if (hasLightBand) {
    add('猫眼甲', quality - (localized ? 5 : 12), `检测到 ${profile.lightBandVotes||1} 条独立的细长高光带，优先匹配猫眼磁光；单张静态图无法验证光带是否会随角度移动。`);
    add('天鹅绒猫眼', quality - (localized ? 11 : 18), '多条柔和纵向亮带也符合磁粉均匀聚集的天鹅绒猫眼特征。');
  }
  if (strongMirror&&!hasLightBand) {
    add('镜面甲', quality - (localized ? 9 : 25), '可见甲面有较大面积的近白强反光，候选接近连续镜面效果。');
  }
  if (multiColorReflection&&!hasLightBand) {
    add('全息甲', quality - (localized ? 13 : 27), '可见区域同时出现多色相与高亮反射，候选接近全息或偏光效果。');
    add('极光甲', quality - (localized ? 18 : 31), '多色柔和反射也可能来自半透明极光粉，作为相关候选保留。');
  }
  if (!hasLightBand&&profile.edgeDensity>.2&&profile.hueSpread>=5) {
    add('碎玻璃甲', quality - (localized ? 16 : 30), '局部存在较密集的高频边缘和多色反光，可能使用切片或碎玻璃装饰。');
  }
  const syrupEvidence=!hasLightBand&&!strongMirror&&!multiColorReflection&&hasVisibleGloss&&
    profile.saturation<.5&&profile.luma>.45&&profile.contrast<.14&&profile.edgeDensity<.18&&profile.hueSpread<=3;
  if (syrupEvidence) {
    add('糖浆甲', quality - (localized ? 12 : 20), '颜色层次偏柔和，并保留明显亮面高光，候选接近半透明糖浆或果冻质感。');
  }
  if (!candidates.length) {
    add('全色甲', quality - (localized ? 17 : 28), '未检测到稳定磁光、镜面、偏光或颗粒证据，仅保留连续单色覆盖这一基础构图候选。');
  }
  if (localized&&!hasVisibleGloss&&profile.specularRatio<.006&&profile.highlightRatio<.035) {
    add('磨砂甲', quality - (localized ? 11 : 27), '可见区域缺少集中高光，磨砂仅作为低优先级候选。');
  }

  return candidates.sort((a,b)=>b.score-a.score).slice(0,5);
}

function nailCandidates(profile, quality) {
  const tags=[];
  if (profile.distalRatio>1.02) tags.push(tag('长甲',Math.min(67,quality-15),'指尖至末端关节的长度明显高于相邻指节，存在较长延长甲证据。','nails'));
  else if (profile.distalRatio>.78) tags.push(tag('中长甲',Math.min(64,quality-18),'指尖至末端关节的比例支持中长甲候选。','nails'));
  else if (profile.distalRatio<.5) tags.push(tag('短甲',Math.min(61,quality-21),'指尖至末端关节的比例较短，仅保留短甲候选。','nails'));
  return [...tags,...nailEffectCandidates(profile,quality,true)];
}

async function getFaceLandmarker() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const visionTasks = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm');
      const vision = await visionTasks.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
      return visionTasks.FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
        runningMode:'IMAGE', numFaces:1,
        minFaceDetectionConfidence:.5, minFacePresenceConfidence:.5, minTrackingConfidence:.5
      });
    })().catch(reason => { faceLandmarkerPromise = null; throw reason; });
  }
  return faceLandmarkerPromise;
}

async function getHandLandmarker() {
  if (!handLandmarkerPromise) {
    handLandmarkerPromise = (async () => {
      const visionTasks = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm');
      const vision = await visionTasks.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
      return visionTasks.HandLandmarker.createFromOptions(vision, {
        baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'},
        runningMode:'IMAGE', numHands:2, minHandDetectionConfidence:.45, minHandPresenceConfidence:.45
      });
    })().catch(reason => { handLandmarkerPromise=null; throw reason; });
  }
  return handLandmarkerPromise;
}

function landmarkDistance(points, a, b, width, height) {
  return Math.hypot((points[a].x - points[b].x) * width, (points[a].y - points[b].y) * height);
}

function faceBounds(points) {
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const padX = (maxX - minX) * .06, padY = (maxY - minY) * .05;
  return { x:clamp(minX - padX,0,1), y:clamp(minY - padY,0,1), width:clamp(maxX-minX+padX*2,.05,1), height:clamp(maxY-minY+padY*2,.05,1) };
}

function faceTags(points, image, quality) {
  const width = image.naturalWidth||image.width, height = image.naturalHeight||image.height;
  const d = (a,b) => landmarkDistance(points,a,b,width,height);
  const faceLength = d(10,152), cheekWidth = d(234,454), jawWidth = d(172,397), foreheadWidth = d(127,356);
  const ratio = faceLength / Math.max(1, cheekWidth);
  const jawRatio = jawWidth / Math.max(1, cheekWidth), foreheadJaw = foreheadWidth / Math.max(1, jawWidth);
  const midX = (points[234].x + points[454].x) / 2;
  const yaw = Math.abs(points[1].x - midX) / Math.max(.01, Math.abs(points[454].x - points[234].x));
  const eyeRoll = Math.abs(((points[33].y + points[133].y) / 2) - ((points[263].y + points[362].y) / 2));
  const posePenalty = yaw * 115 + eyeRoll * 430;
  const structureScore = clamp(Math.min(84, quality - 4) - posePenalty, 42, 84);

  let faceName = '鹅蛋脸';
  if (ratio > 1.47) faceName = '长脸';
  else if (ratio < 1.19) faceName = jawRatio > .84 ? '方脸' : '圆脸';
  else if (foreheadJaw > 1.13 && jawRatio < .79) faceName = '心形脸';
  else if (jawWidth > foreheadWidth * 1.08) faceName = '正三角脸';
  else if (cheekWidth > foreheadWidth * 1.08 && cheekWidth > jawWidth * 1.12) faceName = '菱形脸';

  const rightEyeWidth = d(33,133), leftEyeWidth = d(263,362);
  const rightEyeHeight = d(159,145), leftEyeHeight = d(386,374);
  const eyeRatio = ((rightEyeWidth / Math.max(1,rightEyeHeight)) + (leftEyeWidth / Math.max(1,leftEyeHeight))) / 2;
  const eyeName = eyeRatio < 2.45 ? '圆眼' : eyeRatio > 3.35 ? '细长眼' : '杏仁眼';
  const eyeWidthNorm = ((Math.abs(points[33].x-points[133].x)+Math.abs(points[263].x-points[362].x))/2);
  const eyeSlope = (((points[133].y-points[33].y)+(points[362].y-points[263].y))/2) / Math.max(.01,eyeWidthNorm);
  let angleName = '水平眼位';
  if (eyeSlope > .075) angleName = '明显上挑';
  else if (eyeSlope > .025) angleName = '轻微上挑';
  else if (eyeSlope < -.075) angleName = '明显下垂';
  else if (eyeSlope < -.025) angleName = '轻微下垂';

  const browArch = (indices, start, end) => {
    const baseline = (points[start].y + points[end].y) / 2;
    const peak = Math.min(...indices.map(index => points[index].y));
    return ((baseline - peak) * height) / Math.max(1, d(start,end));
  };
  const browRatio = (browArch([70,63,105,66,107],70,107) + browArch([336,296,334,293,300],336,300)) / 2;
  const browName = browRatio < .045 ? '平直眉' : browRatio > .16 ? '高挑眉' : browRatio > .09 ? '拱形眉' : '标准眉';

  const mouthWidth = d(61,291), lipHeight = d(0,17), lipRatio = lipHeight / Math.max(1,mouthWidth);
  const lipName = lipRatio > .28 ? '厚唇' : lipRatio < .16 ? '薄唇' : '标准唇';
  const noseRatio = d(98,327) / Math.max(1,cheekWidth);
  const tags = [
    tag(faceName, structureScore, `关键点测得脸长/颧部宽约 ${ratio.toFixed(2)}，下颌/颧部宽约 ${jawRatio.toFixed(2)}。`, 'face'),
    tag(eyeName, structureScore - 4, `双眼平均眼裂长高比约 ${eyeRatio.toFixed(2)}。`, 'face'),
    tag(angleName, structureScore - 7, '以内外眼角相对高度估计眼位走向；已对两眼取平均。', 'face'),
    tag(browName, structureScore - 12, `双眉关键点的平均峰高/眉长约 ${browRatio.toFixed(2)}；表情可能改变该数值。`, 'face'),
    tag(lipName, structureScore - 10, `唇部可见高度与口裂宽度比约 ${lipRatio.toFixed(2)}。`, 'face')
  ];
  if (noseRatio > .3) tags.push(tag('宽鼻', structureScore - 13, `鼻翼宽/颧部宽约 ${noseRatio.toFixed(2)}。`, 'face'));
  else if (noseRatio < .21) tags.push(tag('窄鼻', structureScore - 13, `鼻翼宽/颧部宽约 ${noseRatio.toFixed(2)}。`, 'face'));
  return { tags, yaw, eyeRoll, bounds:faceBounds(points) };
}

function colorTag(profile, mode, score) {
  const nearest = nearestShade(profile.rgb, mode);
  if (!nearest) return tag('屏幕近似色', score, `代表色约为 ${profile.color}。`, 'swatch', profile.color);
  const similarity = clamp(82 - nearest.distance * .72, 38, 78);
  return tag(nearest.item.name, Math.min(score, similarity), `像素代表色约 ${profile.color}，与资料库 ${nearest.item.hex} 最接近；仅为屏幕端近似。`, 'swatch', nearest.item.hex);
}

function loadAtlasImage(file) {
  if (!atlasImageCache.has(file)) atlasImageCache.set(file, new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image); image.onerror=reject; image.src=file;
  }));
  return atlasImageCache.get(file);
}

async function atlasProfile(item) {
  const example=(EXAMPLES_BY_ID[item.group]||{})[item.refId] || (EXAMPLES[item.group]||{})[item.key];
  if (!example) return null;
  const image=await loadAtlasImage(example.file);
  const columns=['0%','33.333%','66.667%','100%'], rows=['0%','50%','100%'];
  const col=Math.max(0,columns.indexOf(example.x)), row=Math.max(0,rows.indexOf(example.y));
  return analyzePixels(image,{x:col/4,y:row/3,width:.25,height:1/3});
}

function visualSimilarity(source, reference, item) {
  const colorDistance=Math.hypot(...rgbToLab(source.rgb).map((value,i)=>value-rgbToLab(reference.rgb)[i]));
  const colorWeight=/甲|唇|妆效|光|色/.test(item.name) ? .25 : .08;
  const distance =
    Math.min(1,colorDistance/90)*colorWeight +
    Math.min(1,Math.abs(source.luma-reference.luma)/.5)*.12 +
    Math.min(1,Math.abs(source.saturation-reference.saturation)/.6)*.12 +
    Math.min(1,Math.abs(source.contrast-reference.contrast)/.3)*.15 +
    Math.min(1,Math.abs(source.highlightRatio-reference.highlightRatio)/.3)*.16 +
    Math.min(1,Math.abs(source.edgeDensity-reference.edgeDensity)/.35)*.12 +
    Math.min(1,Math.abs(Math.log(Math.max(.1,source.aspect)/Math.max(.1,reference.aspect)))/1.2)*.08;
  return clamp(Math.round(92-distance*72),28,92);
}

async function enrichWithAtlas(tags, profiles) {
  return Promise.all(tags.map(async item=>{
    const source=profiles[item.group] || profiles.default;
    if (!source || item.group==='swatch') return item;
    try {
      const reference=await atlasProfile(item);
      if (!reference) return item;
      const atlasScore=visualSimilarity(source,reference,item);
      item.atlasScore=atlasScore;
      item.score=Math.round(item.score*.68+atlasScore*.32);
      item.evidence += ` 与资料库“${item.name}”图例的局部视觉接近度约 ${atlasScore}%。`;
    } catch (_) { /* atlas comparison is optional when an asset cannot be decoded */ }
    return item;
  }));
}

async function buildAnalysis() {
  const source=analysisSource();
  const globalProfile = analyzePixels(source);
  let quality = qualityAssessment(globalProfile);
  const uncertainties = [...quality.notes];
  let profile = globalProfile, tags = [], method = '本地像素特征';
  let title = '视觉标签候选', note = '结果来自当前图片的颜色、明暗、反光、纹理与轮廓测量。';

  if (activeMode === 'face' || activeMode === 'makeup') {
    let detected = null;
    try {
      const landmarker = await getFaceLandmarker();
      const result = landmarker.detect(source);
      detected = result.faceLandmarks?.[0] || null;
      method = detected ? '本地面部关键点 + 像素特征' : '本地像素特征 · 未检测到面部';
    } catch (_) {
      method = '本地像素特征 · 面部模型未加载';
      uncertainties.push('面部关键点模型本次未能加载，因此不输出脸型、眉眼、鼻唇等结构标签');
    }
    if (detected) {
      const measured = faceTags(detected, source, quality.score);
      profile = analyzePixels(source, measured.bounds);
      if (measured.yaw > .08 || measured.eyeRoll > .018) uncertainties.push('面部存在转头或画面倾斜，结构标签置信度已自动下调');
      if (activeMode === 'face') {
        title = '面部特征候选';
        note = '结构标签来自 478 点面部网格的比例测量，同一张脸允许多个维度共存。';
        tags = measured.tags;
      } else {
        title = '妆容与色彩候选';
        note = '妆容风格由面部区域的色彩、反光和对比特征估计。';
        const lips=lipProfile(detected,source);
        tags = [...makeupStyleCandidates(profile,lips,quality.score), ...lipFinishCandidates(lips, quality.score), colorTag(lips, 'makeup', 72)];
        tags = await enrichWithAtlas(tags,{styles:profile,finishes:lips,products:lips,default:lips});
        note = '妆容先分离唇部并检测色膜内部的相对高光，再给出多个整体妆容、唇部妆效和产品候选。';
      }
    } else if (activeMode === 'face') {
      title = '未能确认面部结构';
      note = '没有稳定检测到单张正面人脸，因此不生成可能误导的五官标签。';
      uncertainties.push('请使用单人、正面、无遮挡且面部占画面较大的照片后重试');
    } else {
      if (focusCrop) {
        title='局部妆效与色彩候选';
        note='框选区域不足以判断完整妆容风格，但仍可分析局部色彩、反光和质地；若框选的是嘴唇，会优先给出唇妆候选。';
        profile=globalProfile;
        tags=[...lipFinishCandidates(profile,quality.score),colorTag(profile,'makeup',66)];
        tags=await enrichWithAtlas(tags,{finishes:profile,products:profile,default:profile});
        uncertainties.push('局部框选未包含完整面部，因此本次不输出整体妆容风格');
      } else {
        const subject=centralSubjectProfile(source);
        profile=subject.profile;
        quality=qualityAssessment(profile);
        if (subject.localized) {
          title='低置信度妆容候选';
          note='未稳定定位五官，但已分离中央主体并给出多个整体色彩与妆容风格候选，不直接拒绝当前图片。';
          method='中央人像主体分离 + 背景抑制 + 资料库对照';
          tags=[...makeupAppearanceCandidates(profile,quality.score),colorTag(profile,'makeup',48)];
          tags=await enrichWithAtlas(tags,{styles:profile,default:profile});
          uncertainties.push('未定位到嘴唇与眼妆区域，因此暂不输出哑光、水光或果冻唇等局部妆效；可手动框选嘴唇后重新识别');
        } else {
          title = '未能确认妆容主体';
          note = '画面中没有可稳定分离的人像主体，为避免把背景识别为妆容，本次不生成标签。';
          tags = [];
          uncertainties.push('可手动框选人脸或嘴唇区域后重新识别');
        }
      }
    }
  } else if (activeMode === 'body') {
    title='身形轮廓候选';
    note='仅比较正面全身图中的肩、腰、髋相对宽度；不从图片推断体重、体脂率、健康或性别。';
    method='前景轮廓分离 + 肩腰髋相对宽度';
    const metrics=bodySilhouetteProfile(source);
    if (metrics) {
      profile=analyzePixels(source,metrics.bounds);
      quality=qualityAssessment(profile);
      tags=bodyCandidates(metrics,quality.score);
      uncertainties.push('衣袖、手臂位置、宽松或塑形服装会改变外轮廓；纵向比例和左右状态需用规范站姿的第二张图片复核');
    } else {
      title='未能确认完整身形轮廓';
      note='背景或人物边界不足以稳定分离，因此本次不生成身形标签。';
      tags=[];
      uncertainties.push('请使用单人正面全身照，保持自然站立、手臂与躯干略有间隔，并选择与服装有反差的纯色背景');
    }
  } else if (activeMode === 'product') {
    title = '产品、色彩与质地候选';
    const subject=focusCrop ? {profile:globalProfile,localized:true,touchesEdge:false,backgroundRisk:false} : centralSubjectProfile(source);
    profile=subject.profile; quality=qualityAssessment(profile);
    method=subject.localized ? '中央产品主体分离 + 背景抑制 + 资料库对照' : '中央主体候选 + 背景风险检测';
    note = '先从画面中央分离单个产品主体，背景像素不参与色号、质地和图例匹配。';
    if (subject.localized) {
      tags = [...productCandidates(profile, quality.score), colorTag(profile, 'product', 67), finishCandidate(profile, Math.min(70, quality.score - 10))];
      tags = await enrichWithAtlas(tags,{products:profile,finishes:profile,default:profile});
    } else {
      title='未能确认独立产品主体';
      note='为了避免把桌面或背景识别成产品，本次不生成品类、色号和质地标签。';
      tags=[];
      uncertainties.push('请使用与产品颜色反差明显的纯净背景，并完整拍入单个产品后重试');
    }
    if (subject.touchesEdge) uncertainties.push('产品主体接近或超出画面边缘，包装比例与品类判断已降低可信度');
    if (subject.backgroundRisk) uncertainties.push('检测到背景纹理或颜色较复杂，建议改用纯色背景重新拍摄');
    uncertainties.push('当前版本尚未启用品牌包装文字识别；同形容器可能对应不同产品，品类候选应结合刷头、泵头和标签人工复核');
  } else {
    title = '美甲类型与效果候选';
    note = '先用手部关键点定位多个指尖，再在甲片局部比较轮廓、颜色、高光与资料库图例。';
    let localizedNails=false;
    try {
      const landmarker=await getHandLandmarker();
      const result=landmarker.detect(source);
      const hands=result.landmarks||[];
      const nailProfiles=hands.map(points=>nailProfileFromHand(points,source)).filter(Boolean);
      const localized=averageProfiles(nailProfiles);
      if (localized) {
        profile=localized; quality=qualityAssessment(profile); localizedNails=true; method='本地手部关键点 + 分指甲片特征 + 资料库对照';
      } else uncertainties.push('甲片定位不完整，甲型和长度暂不输出；颜色、光泽与效果仍按可见主体给出候选');
    } catch (_) {
      uncertainties.push('手部关键点模型本次未能加载，已切换为中央手部主体的外观候选；甲型和长度置信度不足');
    }
    if (localizedNails) {
      title='分甲片美甲候选';
      note='颜色从每个甲面的中央区域稳健取样，款式依据多甲片高光、反射与纹理证据综合判断。';
      tags = [...nailCandidates(profile, quality.score), colorTag(profile, 'nail', 74)];
      tags = await enrichWithAtlas(tags,{nails:profile,default:profile});
      uncertainties.push('当前关键点模型不能直接分割甲片边缘，因此没有足够轮廓证据时不会输出甲型；动态猫眼、温变和光变效果仍建议用第二角度复核');
    } else {
      const subject=centralSubjectProfile(source);
      const bandEvidence=highlightBandEvidence(source);
      profile={...subject.profile,lightBandVotes:bandEvidence.count,nailCount:0};
      if (bandEvidence.rgb) {
        profile.rgb=bandEvidence.rgb;
        profile.color=hex(bandEvidence.rgb);
      }
      quality=qualityAssessment(profile);
      method='中央手部主体外观 + 多亮带检测 + 背景抑制 + 资料库对照';
      title='美甲颜色与效果候选';
      note='手部关键点未稳定定位时，只输出有颜色或多条高光证据支持的候选，不再根据固定裁剪框猜测甲型。';
      tags=[colorTag(profile,'nail',60),...nailEffectCandidates(profile,quality.score,false)];
      tags=await enrichWithAtlas(tags,{nails:profile,default:profile});
      uncertainties.push('本次未获得独立甲片轮廓，因此甲型和长度已主动留空；若补充正面手背图，可进一步判断');
    }
  }
  if (!uncertainties.length) uncertainties.push('单张图片仍会受到白平衡、显示设备与压缩影响；建议在中性光下用第二张角度照片复核');
  if (focusCrop) method=`手动框选 · ${method}`;
  return { title, note, tags, uncertainty:uncertainties.join('；') + '。', profile, quality, method };
}

function thumb(group, key, name) {
  if (group === 'swatch') return `<div class="result-thumb" role="img" aria-label="${esc(name)}近似色块" style="background:${esc(key)}"></div>`;
  if (group === 'body') {
    const example=BODY_EXAMPLES[key]||BODY_EXAMPLES[name];
    if (!example) return '<div class="result-thumb" aria-hidden="true"></div>';
    return `<div class="result-thumb" role="img" aria-label="${esc(example.alt)}" style="--sheet:url('${esc(example.file)}');--x:${example.x};--y:${example.y}"></div>`;
  }
  const refId=referenceId(group,key);
  const example = (EXAMPLES_BY_ID[group]||{})[refId] || (EXAMPLES[group] || {})[key];
  if (!example) return '<div class="result-thumb" aria-hidden="true"></div>';
  return `<div class="result-thumb" role="img" aria-label="${esc(example.alt)}" style="--sheet:url('${esc(example.file)}');--x:${example.x};--y:${example.y}"></div>`;
}

function comparisonSourceDataUrl() {
  const canvas=document.createElement('canvas');
  const crop=focusCrop||{x:0,y:0,width:1,height:1};
  const width=preview.naturalWidth*crop.width, height=preview.naturalHeight*crop.height;
  const scale=Math.min(1,1200/Math.max(width,height));
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  canvas.getContext('2d').drawImage(preview,crop.x*preview.naturalWidth,crop.y*preview.naturalHeight,width,height,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.9);
}

function openComparison(article) {
  const group=article.dataset.group;
  const key=article.dataset.referenceKey;
  const refId=referenceId(group,key);
  const example=group==='body' ? BODY_EXAMPLES[key] : (EXAMPLES_BY_ID[group]||{})[refId] || (EXAMPLES[group]||{})[key];
  const reference=$('#comparison-reference');
  $('#comparison-title').textContent=article.dataset.label||'图例对照';
  $('#comparison-group').textContent=groupLabels[group]||'资料库候选';
  $('#comparison-score').textContent=article.dataset.manual==='true'?'人工确认':article.dataset.atlasScore?`${article.dataset.atlasScore}%`:`${article.dataset.score||'—'}%`;
  $('#comparison-evidence').textContent=article.dataset.evidence||'当前候选来自本地视觉特征排序。';
  $('#comparison-source').src=comparisonSourceDataUrl();
  if (group==='swatch') {
    reference.style.cssText=`background:${key}`;
    reference.setAttribute('aria-label',`${article.dataset.label}近似色块`);
    $('#comparison-reference-caption').textContent='资料库近似色块';
  } else if (example) {
    reference.style.cssText=`--sheet:url('${example.file}');--x:${example.x};--y:${example.y}`;
    reference.setAttribute('aria-label',example.alt||`${article.dataset.label}资料库图例`);
    $('#comparison-reference-caption').textContent='资料库标准图例';
  } else {
    reference.style.cssText='background:#2b2430';
    reference.setAttribute('aria-label','当前标签暂无图例');
    $('#comparison-reference-caption').textContent='当前标签暂无可显示图例';
  }
  const dialog=$('#comparison-dialog');
  currentComparisonArticle = article;
  const trigger=document.activeElement;
  dialog.addEventListener('close',()=>{ if(trigger && trigger.isConnected) trigger.focus(); },{once:true});
  if (typeof dialog.showModal==='function') dialog.showModal(); else dialog.setAttribute('open','');
  const closeBtn = dialog.querySelector('button[type="submit"]');
  if (closeBtn) closeBtn.focus();
}

function readFeedback() {
  try { return JSON.parse(localStorage.getItem(FEEDBACK_KEY)||'{}'); }
  catch (_) { return {}; }
}

function readCalibration() {
  try { return JSON.parse(localStorage.getItem(CALIBRATION_KEY)||'{}'); }
  catch (_) { return {}; }
}

function anonymousSampleId() {
  const crop=focusCrop ? [focusCrop.x,focusCrop.y,focusCrop.width,focusCrop.height].map(value=>value.toFixed(3)).join(',') : 'full';
  const source=[currentFile?.size||0,currentFile?.lastModified||0,preview.naturalWidth,preview.naturalHeight,activeMode,crop].join(':');
  let hash=2166136261;
  for (let index=0;index<source.length;index++) hash=Math.imul(hash^source.charCodeAt(index),16777619);
  return `local-${(hash>>>0).toString(36)}`;
}

function updateCalibrationCount() {
  const count=Object.keys(readCalibration()).length;
  $('#calibration-count').textContent=`${count} 条校准`;
  $('#export-calibration').disabled=!count;
}

function correctionGroup(label) {
  if (activeMode==='face') return (EXAMPLES.face||{})[label]?'face':'manual';
  if (activeMode==='body') return BODY.tags.some(item=>item.name===label)?'body':'manual';
  const groups=activeMode==='nail' ? ['nails','shades'] : activeMode==='product' ? ['products','finishes','shades'] : activeMode==='makeup' ? ['styles','finishes','products','shades'] : [];
  return groups.find(group=>(BEAUTY[group]||[]).some(item=>item.name===label))||'manual';
}

function updateCorrectionOptions() {
  const groups=activeMode==='nail' ? ['nails','shades'] : activeMode==='product' ? ['products','finishes','shades'] : activeMode==='makeup' ? ['styles','finishes','products','shades'] : [];
  const names=activeMode==='face' ? Object.keys(EXAMPLES.face||{}) : activeMode==='body' ? BODY.tags.map(item=>item.name) : [...new Set(groups.flatMap(group=>(BEAUTY[group]||[]).map(item=>item.name)))];
  $('#correction-options').innerHTML=names.map(name=>`<option value="${esc(name)}"></option>`).join('');
}

function correctionHasExample(item) {
  if (item.group==='swatch') return true;
  if (item.group==='body') return Boolean(BODY_EXAMPLES[item.label]);
  const refId=referenceId(item.group,item.label);
  return Boolean((EXAMPLES_BY_ID[item.group]||{})[refId]||(EXAMPLES[item.group]||{})[item.label]);
}

function atlasDestination(group,label,key=label,refId=null) {
  if (group==='face') return `./index.html?tag=${encodeURIComponent(label)}&from=recognize`;
  if (group==='body') {
    const item=BODY.tags.find(entry=>entry.id===refId||entry.name===label||entry.name===key);
    return `./body.html?tag=${encodeURIComponent(item?.id||label)}&from=recognize`;
  }
  const mode=group==='swatch'?'shades':group;
  if (!['products','shades','finishes','styles','nails'].includes(mode)) return '';
  const item=(BEAUTY[mode]||[]).find(entry=>entry.id===refId||entry.name===label||entry.name===key);
  const target=item?.id||label;
  return `./beauty.html?mode=${encodeURIComponent(mode)}&item=${encodeURIComponent(target)}&from=recognize`;
}

function atlasLink(group,label,key=label,refId=null) {
  const href=atlasDestination(group,label,key,refId);
  return href?`<a class="atlas-detail-link" href="${esc(href)}">在图鉴中查看 ↗</a>`:'';
}

function readHistory() {
  try {
    const records=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');
    return Array.isArray(records)?records:[];
  } catch (_) { return []; }
}

function historyModeLabel(mode) {
  return ({face:'面部特征',body:'人体身形',makeup:'完整妆容',product:'美妆产品',nail:'美甲'})[mode]||'识图';
}

function renderHistory() {
  const records=readHistory();
  $('#history-count').textContent=records.length;
  $('#history-clear').disabled=!records.length;
  $('#history-list').innerHTML=records.length?records.map(record=>{
    const time=new Date(record.created_at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const tags=(record.tags||[]).map(item=>`<li><span><b>${esc(item.name)}</b><small>${esc(groupLabels[item.group]||'相关候选')}</small></span><strong>${Number(item.score)||0}%</strong>${atlasLink(item.group,item.name,item.key,item.refId)}</li>`).join('');
    return `<article class="history-card" tabindex="-1"><div class="history-card-head"><span>${esc(historyModeLabel(record.mode))}</span><time datetime="${esc(record.created_at)}">${esc(time)}</time></div><h3>${esc(record.title)}</h3><p>图像质量 ${Number(record.quality)||0}% · ${record.tags?.length||0} 个主要候选</p><ul>${tags}</ul></article>`;
  }).join(''):'<div class="history-empty"><b>还没有识别记录</b><p>完成一次识别后，这里会保存不含图片的结果摘要。</p></div>';
}

function saveHistory(data) {
  const record={
    id:currentAnalysisMeta.sampleId,
    created_at:new Date().toISOString(),
    mode:activeMode,
    title:data.title,
    quality:data.quality.score,
    tags:data.tags.slice().sort((a,b)=>b.score-a.score).slice(0,8).map(item=>({name:item.name,score:item.score,group:item.group,key:item.key,refId:item.refId||null}))
  };
  const records=readHistory().filter(item=>item.id!==record.id);
  records.unshift(record);
  try { localStorage.setItem(HISTORY_KEY,JSON.stringify(records.slice(0,12))); } catch (_) { /* local history is optional */ }
  renderHistory();
}

function renderConfirmedCorrections() {
  const section=$('#confirmed-corrections');
  section.hidden=!sessionCorrections.length;
  $('#confirmed-correction-list').innerHTML=sessionCorrections.map(item=>{
    const compare=correctionHasExample(item)?'<button class="compare-trigger" type="button" data-open-comparison>查看资料库图例</button>':'<span>资料库暂无同名图例</span>';
    const refId=referenceId(item.group,item.label);
    return `<article class="confirmed-correction-card" data-manual="true" data-correction-id="${esc(item.id)}" data-group="${esc(item.group)}" data-label="${esc(item.label)}" data-reference-key="${esc(item.label)}" data-ref-id="${esc(refId||'')}" data-evidence="${esc(`由你人工补充“${item.label}”，该标签不使用模型置信度。`)}">${thumb(item.group,item.label,item.label)}<div class="confirmed-correction-copy"><b>${esc(item.label)}</b><span>人工确认 · 不参与模型排序</span><div class="result-reference">${compare}${atlasLink(item.group,item.label,item.label,refId)}</div></div><button type="button" data-remove-correction>移除</button></article>`;
  }).join('');
}

function recordCalibration(article,key,vote) {
  if (!currentAnalysisMeta) return;
  const records=readCalibration();
  const id=`${currentAnalysisMeta.sampleId}:${key}`;
  if (!vote) delete records[id];
  else records[id]={
    sample_id:currentAnalysisMeta.sampleId,
    mode:currentAnalysisMeta.mode,
    quality:currentAnalysisMeta.quality,
    group:article.dataset.group,
    label:article.dataset.label,
    reference_key:article.dataset.referenceKey,
    base_score:Number(article.dataset.baseScore),
    atlas_score:Number(article.dataset.atlasScore)||null,
    verdict:vote,
    updated_at:new Date().toISOString()
  };
  try { localStorage.setItem(CALIBRATION_KEY,JSON.stringify(records)); } catch (_) { /* local calibration is optional */ }
  updateCalibrationCount();
}

function feedbackKey(item) { return `${activeMode}:${item.group}:${item.key||item.name}`; }
function feedbackBias(vote) { return vote==='yes' ? 5 : vote==='no' ? -7 : 0; }
function adjustedTag(item, feedback) {
  const vote=feedback[feedbackKey(item)]||'';
  return {...item,baseScore:item.score,score:clamp(item.score+feedbackBias(vote),1,99),vote};
}

const groupLabels={face:'面部结构',body:'身形轮廓',styles:'妆容风格',finishes:'妆效与质地',products:'产品候选',nails:'美甲标签',swatch:'近似色号'};

function renderResultItem(item,index=0) {
  const conf=confidence(item.score);
  const key=encodeURIComponent(feedbackKey(item));
  const atlas=item.atlasScore ? `<span class="atlas-match">图例接近度 ${item.atlasScore}%</span>` : '<span class="atlas-match">资料库候选</span>';
  return `<article class="result-item ${conf.level}${index>=3?' related-extra':''}" tabindex="-1" data-feedback-key="${key}" data-base-score="${item.baseScore}" data-score="${item.score}" data-group="${esc(item.group)}" data-label="${esc(item.name)}" data-reference-key="${esc(item.key||item.name)}" data-ref-id="${esc(item.refId||'')}" data-atlas-score="${item.atlasScore||''}" data-evidence="${esc(item.evidence)}">${thumb(item.group,item.key,item.name)}<div class="result-copy"><div class="result-row"><b>${esc(item.name)}</b><span class="score-wrap"><small>${conf.label}</small><span class="score">${item.score}%</span></span></div><div class="confidence-track" aria-label="${esc(item.name)}置信度 ${item.score}%"><i style="--score:${item.score}%"></i></div><p>${esc(item.evidence)}</p><div class="result-meta"><div class="result-reference">${atlas}<button class="compare-trigger" type="button" data-open-comparison>放大对照</button>${atlasLink(item.group,item.name,item.key||item.name,item.refId)}</div><div class="feedback-actions" aria-label="这个候选是否符合"><button type="button" data-vote="yes" aria-pressed="${item.vote==='yes'}">符合</button><button type="button" data-vote="no" aria-pressed="${item.vote==='no'}">不符合</button></div></div></div></article>`;
}

function renderAnalysis(data) {
  currentAnalysisMeta={sampleId:anonymousSampleId(),mode:activeMode,quality:data.quality.score};
  $('#correction-submit').disabled=false;
  $('#correction-status').textContent='';
  updateCorrectionOptions();
  $('#analysis-badge').textContent = '实际分析';
  $('#analysis-method').textContent = data.method;
  $('#result-summary').innerHTML = `<small>${esc(currentFile?.name || '当前图片')} · ${data.tags.length} 个候选标签 · 图像质量 ${data.quality.score}%</small><h3>${esc(data.title)}</h3><p>${esc(data.note)}</p>`;
  const texture = data.profile.edgeDensity > .2 ? '较丰富' : data.profile.edgeDensity > .1 ? '中等' : '较平滑';
  $('#visual-profile').innerHTML = [
    `<div class="profile-chip color" style="--sample:${data.profile.color}"><i></i><span>代表色</span><b>${data.profile.color}</b></div>`,
    `<div class="profile-chip"><span>平均明度</span><b>${Math.round(data.profile.luma * 100)}%</b></div>`,
    `<div class="profile-chip"><span>平均饱和度</span><b>${Math.round(data.profile.saturation * 100)}%</b></div>`,
    `<div class="profile-chip"><span>纹理细节</span><b>${texture}</b></div>`
  ].join('');
  const feedback=readFeedback();
  const groups={};
  data.tags.map(item=>adjustedTag(item,feedback)).forEach(item=>(groups[item.group]||=[]).push(item));
  $('#result-list').innerHTML = Object.entries(groups).map(([group,items])=>{
    items.sort((a,b)=>b.score-a.score);
    const more=items.length>3 ? `<button class="related-toggle" type="button" data-expand-group aria-expanded="false">查看更多相关候选（${items.length-3}）</button>` : '';
    return `<section class="result-group"><div class="result-group-title"><b>${groupLabels[group]||'相关候选'}</b><span>${items.length} 项</span></div>${items.map(renderResultItem).join('')}${more}</section>`;
  }).join('') || '<p class="no-result">当前图片没有足够证据生成结构标签。</p>';
  $('#uncertainty-text').textContent = data.uncertainty;
  $('#result-empty').hidden = true;
  $('#result-demo').hidden = false;
  updateCalibrationCount();
  saveHistory(data);
}

function renderLoading() {
  currentAnalysisMeta=null;
  sessionCorrections=[];
  renderConfirmedCorrections();
  $('#correction-submit').disabled=true;
  $('#analysis-badge').textContent = '本地分析中';
  $('#analysis-method').textContent = activeMode === 'face' || activeMode === 'makeup' ? '正在加载关键点并读取像素' : activeMode === 'body' ? '正在分离全身轮廓并比较肩腰髋' : '正在读取颜色、轮廓与纹理';
  const loadingNote=activeMode==='face'||activeMode==='makeup' ? '首次加载面部模型可能需要数秒' : activeMode==='body' ? '正在核对人物是否完整入镜' : '正在读取当前主体的可见特征';
  $('#result-summary').innerHTML = `<div class="result-loading"><div><i></i><b>正在分析当前图片</b><p>${loadingNote}</p></div></div>`;
  $('#visual-profile').innerHTML = '';
  $('#result-list').innerHTML = '';
  $('#uncertainty-text').textContent = '';
  $('#result-empty').hidden = true;
  $('#result-demo').hidden = false;
}

function selectMode(mode) {
  analysisRunId++;
  activeMode = mode;
  sessionCorrections=[];
  renderConfirmedCorrections();
  const guides={
    face:['面部拍摄','单人正面、头部摆正，完整拍入发际线和下巴；避免刘海、手部或强滤镜遮挡五官。'],
    body:['身形拍摄','单人正面自然站立，从头到脚完整入镜；手臂与躯干略有间隔，使用无塑形效果的合体服装和纯色背景。'],
    makeup:['妆容拍摄','完整拍入双眼、双颊和嘴唇，使用中性光与正面角度；不要使用美颜、磨皮或改变颜色的滤镜。'],
    product:['产品拍摄','一次只拍一个产品，完整拍入包装、盖子或刷头；使用纯色且与产品有反差的背景，主体放在中央。'],
    nail:['美甲拍摄（建议）','普通美甲照片也可以识别；如需更准的甲型与长度，请尽量拍入甲根、甲面和甲尖，让五指稍微分开。']
  };
  [photoGuideTitle.textContent,photoGuideText.textContent]=guides[mode];
  modes.forEach(button => {
    const checked = button.dataset.mode === mode;
    button.setAttribute('aria-checked', String(checked));
    button.tabIndex = checked ? 0 : -1;
  });
  updateCorrectionOptions();
  if (!$('#result-demo').hidden) {
    $('#result-demo').hidden = true; $('#result-empty').hidden = false;
    $('#result-empty').innerHTML = '<span>↻</span><h3>识别目标已切换</h3><p>点击“开始本地识别”，按新的标签范围重新分析当前图片。</p>';
  }
}

function displayImageBounds() {
  const rect=imageStage.getBoundingClientRect();
  const scale=Math.min(rect.width/preview.naturalWidth,rect.height/preview.naturalHeight);
  const width=preview.naturalWidth*scale,height=preview.naturalHeight*scale;
  return {left:(rect.width-width)/2,top:(rect.height-height)/2,width,height};
}

function cropFromPointer(event) {
  const rect=imageStage.getBoundingClientRect(), bounds=displayImageBounds();
  const x=clamp(event.clientX-rect.left-bounds.left,0,bounds.width);
  const y=clamp(event.clientY-rect.top-bounds.top,0,bounds.height);
  return {x:x/bounds.width,y:y/bounds.height};
}

function showFocusCrop(crop) {
  if (!crop || !preview.naturalWidth) { focusBox.hidden=true; return; }
  const bounds=displayImageBounds();
  focusBox.hidden=false;
  focusBox.style.left=`${bounds.left+crop.x*bounds.width}px`;
  focusBox.style.top=`${bounds.top+crop.y*bounds.height}px`;
  focusBox.style.width=`${crop.width*bounds.width}px`;
  focusBox.style.height=`${crop.height*bounds.height}px`;
}

function setFocusMode(enabled) {
  focusEnabled=enabled;
  imageStage.classList.toggle('is-selecting',enabled);
  focusToggle.textContent=enabled ? '取消框选' : focusCrop ? '重新框选' : '框选识别区域';
  focusStatus.textContent=enabled ? '在图片上拖动一个矩形' : focusCrop ? '只分析框选区域' : '当前自动定位主体';
}

function clearFocusCrop() {
  focusCrop=null; focusDraft=null; focusStart=null; focusBox.hidden=true; focusReset.hidden=true;
  setFocusMode(false);
}

function finishFocusCrop() {
  if (!focusDraft || focusDraft.width<.06 || focusDraft.height<.06) { focusDraft=null; focusStart=null; showFocusCrop(focusCrop); setFocusMode(false); return; }
  focusCrop=focusDraft; focusDraft=null; focusStart=null; focusReset.hidden=false; showFocusCrop(focusCrop); setFocusMode(false);
  if (!$('#result-demo').hidden) {
    $('#result-demo').hidden=true; $('#result-empty').hidden=false;
    $('#result-empty').innerHTML='<span>⌗</span><h3>识别区域已更新</h3><p>点击“重新识别”，结果将只依据框选区域生成。</p>';
  }
}

function resetImage() {
  analysisRunId++;
  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = ''; currentFile = null; input.value = ''; preview.src = '';
  sessionCorrections=[]; renderConfirmedCorrections();
  previewWrap.hidden = true; drop.hidden = false; analyzeButton.disabled = true;
  focusTools.hidden=true; clearFocusCrop();
  analyzeButton.textContent = '开始本地识别 →';
  $('#result-demo').hidden = true; $('#result-empty').hidden = false;
  $('#result-empty').innerHTML = '<span>03</span><h3>等待图片</h3><p>上传后将生成“标签 + 置信度 + 判断依据 + 不确定性”的实际分析结果。</p>';
  error.hidden = true;
}

async function useFile(file) {
  const loadId=++analysisRunId;
  error.hidden = true;
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) {
    error.textContent = '请选择 JPG、PNG 或 WebP 图片。'; error.hidden = false; return;
  }
  if (file.size > MAX_FILE_BYTES) {
    error.textContent = '图片超过 12 MB，请压缩后再试。'; error.hidden = false; return;
  }
  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = URL.createObjectURL(file); currentFile = file; preview.src = objectURL;
  try { await preview.decode(); } catch (_) { /* handled by naturalWidth */ }
  if (loadId!==analysisRunId) return;
  if (!preview.naturalWidth) {
    resetImage(); error.textContent = '无法读取这张图片，请换一个文件。'; error.hidden = false; return;
  }
  if (preview.naturalWidth * preview.naturalHeight > MAX_IMAGE_PIXELS) {
    resetImage(); error.textContent = '图片像素尺寸过大，请缩小到 3600 万像素以内后再试。'; error.hidden = false; return;
  }
  $('#file-name').textContent = file.name;
  $('#file-meta').textContent = `${formatBytes(file.size)} · ${preview.naturalWidth} × ${preview.naturalHeight} · 仅本地分析`;
  drop.hidden = true; previewWrap.hidden = false; analyzeButton.disabled = false;
  focusTools.hidden=false; clearFocusCrop();
  $('#result-demo').hidden = true; $('#result-empty').hidden = false;
}

async function runAnalysis() {
  if (!currentFile || analyzeButton.disabled) return;
  const runId=++analysisRunId;
  analyzeButton.disabled = true; analyzeButton.classList.add('is-loading'); analyzeButton.textContent = '识别中…';
  error.hidden = true; renderLoading();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    const result=await buildAnalysis();
    if (runId!==analysisRunId) return;
    renderAnalysis(result);
  }
  catch (_) {
    if (runId!==analysisRunId) return;
    error.textContent = '本次分析没有完成，请换一张更清晰的图片后重试。'; error.hidden = false;
    $('#result-demo').hidden = true; $('#result-empty').hidden = false;
  } finally {
    if (runId!==analysisRunId) return;
    analyzeButton.disabled = !currentFile; analyzeButton.classList.remove('is-loading');
    analyzeButton.textContent = currentFile ? '重新识别 →' : '开始本地识别 →';
  }
}

modes.forEach(button => button.addEventListener('click', () => selectMode(button.dataset.mode)));
$('#task-modes').addEventListener('keydown', event => {
  const button = event.target.closest('button[role="radio"]');
  if (!button) return;
  const current = modes.indexOf(button);
  if (current < 0) return;
  let next = -1;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (current + 1) % modes.length;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (current - 1 + modes.length) % modes.length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = modes.length - 1;
      break;
  }
  if (next >= 0) {
    event.preventDefault();
    modes[next].focus();
    selectMode(modes[next].dataset.mode);
  }
});
[drop, $('#choose-image')].forEach(button => button.addEventListener('click', () => input.click()));
input.addEventListener('change', () => useFile(input.files[0]));
$('#remove-image').addEventListener('click', resetImage);
analyzeButton.addEventListener('click', runAnalysis);
focusToggle.addEventListener('click',()=>setFocusMode(!focusEnabled));
focusReset.addEventListener('click',clearFocusCrop);
imageStage.addEventListener('pointerdown',event=>{
  if (!focusEnabled) return;
  event.preventDefault(); imageStage.setPointerCapture(event.pointerId);
  const point=cropFromPointer(event); focusStart=point; focusDraft={x:point.x,y:point.y,width:0,height:0}; showFocusCrop(focusDraft);
});
imageStage.addEventListener('pointermove',event=>{
  if (!focusEnabled || !focusDraft || !imageStage.hasPointerCapture(event.pointerId)) return;
  const point=cropFromPointer(event);
  const x=Math.min(focusStart.x,point.x),y=Math.min(focusStart.y,point.y);
  focusDraft={x,y,width:Math.abs(point.x-focusStart.x),height:Math.abs(point.y-focusStart.y)}; showFocusCrop(focusDraft);
});
imageStage.addEventListener('pointerup',event=>{ if (imageStage.hasPointerCapture(event.pointerId)) imageStage.releasePointerCapture(event.pointerId); finishFocusCrop(); });
imageStage.addEventListener('pointercancel',finishFocusCrop);
window.addEventListener('resize',()=>showFocusCrop(focusCrop));
$('#result-list').addEventListener('click',event=>{
  const compareButton=event.target.closest('[data-open-comparison]');
  if (compareButton) {
    openComparison(compareButton.closest('.result-item'));
    return;
  }
  const expandButton=event.target.closest('[data-expand-group]');
  if (expandButton) {
    const section=expandButton.closest('.result-group');
    const expanded=section.classList.toggle('is-expanded');
    expandButton.setAttribute('aria-expanded',String(expanded));
    const count=section.querySelectorAll('.related-extra').length;
    expandButton.textContent=expanded ? '收起补充候选' : `查看更多相关候选（${count}）`;
    return;
  }
  const button=event.target.closest('[data-vote]');
  if (!button) return;
  const article=button.closest('[data-feedback-key]');
  const key=decodeURIComponent(article.dataset.feedbackKey),vote=button.dataset.vote;
  const feedback=readFeedback();
  feedback[key]=feedback[key]===vote ? '' : vote;
  try { localStorage.setItem(FEEDBACK_KEY,JSON.stringify(feedback)); } catch (_) { /* local feedback is optional */ }
  recordCalibration(article,key,feedback[key]);
  article.querySelectorAll('[data-vote]').forEach(item=>item.setAttribute('aria-pressed',String(feedback[key]===item.dataset.vote)));
  const score=clamp(Number(article.dataset.baseScore)+feedbackBias(feedback[key]),1,99),conf=confidence(score);
  article.dataset.score=score;
  article.classList.remove('high','medium','low'); article.classList.add(conf.level);
  article.querySelector('.score').textContent=`${score}%`; article.querySelector('.score-wrap small').textContent=conf.label;
  article.querySelector('.confidence-track i').style.setProperty('--score',`${score}%`);
});

function bindListKeyboardNav(container, itemSelector, onEnter) {
  container.addEventListener('keydown', event => {
    if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
    const items = [...container.querySelectorAll(itemSelector)].filter(el => el.offsetParent !== null);
    if (!items.length) return;
    if (event.key === 'Enter') {
      const item = event.target.closest(itemSelector);
      if (item && onEnter) { onEnter(item); event.preventDefault(); }
      return;
    }
    let idx = items.findIndex(el => el.contains(event.target) || el === event.target);
    if (idx < 0) idx = event.key === 'ArrowDown' ? -1 : 0;
    const next = event.key === 'ArrowDown'
      ? items[Math.min(idx + 1, items.length - 1)]
      : items[Math.max(idx - 1, 0)];
    if (next && next !== event.target.closest(itemSelector)) {
      event.preventDefault();
      next.focus();
      next.scrollIntoView({ block: 'nearest' });
    }
  });
}
bindListKeyboardNav($('#result-list'), '.result-item', item => {
  const compare = item.querySelector('[data-open-comparison]');
  if (compare) openComparison(item);
});
bindListKeyboardNav($('#history-list'), '.history-card');
$('#clear-feedback').addEventListener('click',()=>{
  try { localStorage.removeItem(FEEDBACK_KEY); } catch (_) { /* local feedback is optional */ }
  try { localStorage.removeItem(CALIBRATION_KEY); } catch (_) { /* local calibration is optional */ }
  updateCalibrationCount();
  document.querySelectorAll('.feedback-actions button').forEach(button=>button.setAttribute('aria-pressed','false'));
  document.querySelectorAll('[data-base-score]').forEach(article=>{
    const score=Number(article.dataset.baseScore),conf=confidence(score);
    article.dataset.score=score;
    article.classList.remove('high','medium','low'); article.classList.add(conf.level);
    article.querySelector('.score').textContent=`${score}%`; article.querySelector('.score-wrap small').textContent=conf.label;
    article.querySelector('.confidence-track i').style.setProperty('--score',`${score}%`);
  });
});
$('#comparison-dialog').addEventListener('click',event=>{
  if (event.target===$('#comparison-dialog')) $('#comparison-dialog').close();
});
$('#comparison-dialog').addEventListener('keydown',event=>{
  if (event.key!=='ArrowLeft' && event.key!=='ArrowRight') return;
  if (!currentComparisonArticle) return;
  const container=currentComparisonArticle.closest('#result-list, #confirmed-correction-list');
  if (!container) return;
  const selector=container.id==='result-list' ? '.result-item' : '.confirmed-correction-card';
  const items=[...container.querySelectorAll(selector)].filter(el=>el.offsetParent!==null);
  if (items.length<2) return;
  const idx=items.indexOf(currentComparisonArticle);
  if (idx<0) return;
  event.preventDefault();
  const next=event.key==='ArrowRight'
    ? items[(idx+1)%items.length]
    : items[(idx-1+items.length)%items.length];
  openComparison(next);
});
$('#history-open').addEventListener('click',()=>{
  renderHistory();
  const dialog=$('#history-dialog');
  const trigger=document.activeElement;
  dialog.addEventListener('close',()=>{ if(trigger && trigger.isConnected) trigger.focus(); },{once:true});
  dialog.showModal();
  const first=$('#history-list .history-card');
  if(first) first.focus();
});
$('#history-dialog').addEventListener('click',event=>{if(event.target===$('#history-dialog')) $('#history-dialog').close()});
$('#history-clear').addEventListener('click',()=>{
  if (!readHistory().length || !window.confirm('清空当前浏览器中的全部识别历史？')) return;
  try { localStorage.removeItem(HISTORY_KEY); } catch (_) { /* local history is optional */ }
  renderHistory();
});
$('#confirmed-correction-list').addEventListener('click',event=>{
  const compareButton=event.target.closest('[data-open-comparison]');
  if (compareButton) { openComparison(compareButton.closest('.confirmed-correction-card')); return; }
  const removeButton=event.target.closest('[data-remove-correction]');
  if (!removeButton) return;
  const article=removeButton.closest('[data-correction-id]');
  const id=article.dataset.correctionId;
  sessionCorrections=sessionCorrections.filter(item=>item.id!==id);
  const records=readCalibration(); delete records[id];
  try { localStorage.setItem(CALIBRATION_KEY,JSON.stringify(records)); } catch (_) { /* local calibration is optional */ }
  renderConfirmedCorrections(); updateCalibrationCount();
});
$('#export-calibration').addEventListener('click',()=>{
  const records=Object.values(readCalibration());
  if (!records.length) return;
  const payload={schema:'face-atlas-calibration-v1',exported_at:new Date().toISOString(),contains_images:false,contains_filenames:false,records};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');
  anchor.href=url; anchor.download=`face-atlas-calibration-${new Date().toISOString().slice(0,10)}.json`; anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),0);
});
$('#correction-form').addEventListener('submit',event=>{
  event.preventDefault();
  const input=$('#correction-input'),label=input.value.trim();
  if (!label || !currentAnalysisMeta) return;
  const records=readCalibration();
  const normalized=label.toLocaleLowerCase().replace(/\s+/g,'-');
  const id=`${currentAnalysisMeta.sampleId}:missing:${normalized}`;
  records[id]={sample_id:currentAnalysisMeta.sampleId,mode:currentAnalysisMeta.mode,quality:currentAnalysisMeta.quality,group:correctionGroup(label),label,reference_key:label,base_score:null,atlas_score:null,verdict:'missing_correct_label',updated_at:new Date().toISOString()};
  try { localStorage.setItem(CALIBRATION_KEY,JSON.stringify(records)); } catch (_) { /* local calibration is optional */ }
  const group=correctionGroup(label);
  if (!sessionCorrections.some(item=>item.id===id)) sessionCorrections.push({id,label,group});
  renderConfirmedCorrections();
  input.value=''; $('#correction-status').textContent=`已记录“${label}”，图片与文件名不会保存。`;
  updateCalibrationCount();
});
updateCalibrationCount();
selectMode('face');
renderHistory();
['dragenter','dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('is-dragging'); }));
['dragleave','drop'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('is-dragging'); }));
drop.addEventListener('drop', event => useFile(event.dataTransfer.files[0]));
window.addEventListener('beforeunload', () => { if (objectURL) URL.revokeObjectURL(objectURL); });
