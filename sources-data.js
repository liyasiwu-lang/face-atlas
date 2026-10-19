(() => {
  const sources = {
    'iso-7250-1': {
      type: '国际标准',
      title: 'ISO 7250-1:2017',
      subtitle: 'Basic human body measurements for technological design - Body measurement definitions and landmarks',
      organization: 'International Organization for Standardization',
      url: 'https://www.iso.org/obp/ui/#!iso:std:65246:en',
      scope: '人体测量条件、解剖标志点与基础尺寸定义。',
      limitation: '用于技术设计中的测量一致性，不提供审美、健康或个体诊断结论。'
    },
    'iso-15535': {
      type: '国际标准',
      title: 'ISO 15535:2023',
      subtitle: 'General requirements for establishing anthropometric databases',
      organization: 'International Organization for Standardization',
      url: 'https://www.iso.org/standard/82541.html',
      scope: '人体测量数据库的样本、记录、质量控制与可比性要求。',
      limitation: '资料库当前是描述性标签库，不是符合该标准建立的群体测量数据库。'
    },
    'iso-cie-11664-4': {
      type: '国际标准',
      title: 'ISO/CIE 11664-4:2019',
      subtitle: 'CIE 1976 L*a*b* colour space',
      organization: 'ISO / International Commission on Illumination',
      url: 'https://www.iso.org/standard/74166.html',
      scope: '明度、色度、色相与颜色差异的仪器化表达框架。',
      limitation: '照片中的肤色仍受白平衡、曝光、显示设备和环境光影响，不能由单张图片得到标准色值。'
    },
    'cie-256-skin-colour': {
      type: '技术报告',
      title: 'CIE 256:2025',
      subtitle: 'Measurement of Human Skin Colour',
      organization: 'International Commission on Illumination',
      url: 'https://cie.co.at/publications/measurement-human-skin-colour-0',
      scope: '人体皮肤颜色测量的照明、仪器、观察条件与报告框架。',
      limitation: '适用于受控测量；本站照片标签不能替代分光测色，也不从肤色推断族裔。'
    },
    'aad-acne-signs': {
      type: '医学科普',
      title: 'Acne: Signs and symptoms',
      subtitle: 'Whiteheads, blackheads, pimples, nodules, cysts and post-inflammatory marks',
      organization: 'American Academy of Dermatology',
      url: 'https://www.aad.org/public/diseases/acne/really-acne/symptoms',
      scope: '痘痘、粉刺、炎症丘疹、瘢痕与炎症后色素沉着的医学边界。',
      limitation: '本站只记录照片中的可见观感，不凭图片诊断痤疮、玫瑰痤疮或其他皮肤病。'
    },
    'craniofacial-digital-anthropometry': {
      type: '开放综述',
      title: 'Application of Digital Anthropometry for Craniofacial Assessment',
      subtitle: 'Craniomaxillofacial Trauma & Reconstruction, 2014',
      organization: 'PubMed Central',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4078131/',
      scope: '颅面测量标志点、二维与三维数字测量方法及其适用场景。',
      limitation: '临床测量框架可帮助定义观察点，但 Face Atlas 的俗称标签不等同临床分类。'
    },
    'nhanes-anthropometry-2021': {
      type: '测量手册',
      title: 'NHANES 2021 Anthropometry Procedures Manual',
      subtitle: 'National Health and Nutrition Examination Survey',
      organization: 'U.S. Centers for Disease Control and Prevention',
      url: 'https://stacks.cdc.gov/view/cdc/127207/cdc_127207_DS1.pdf',
      scope: '身高、肢段长度、腰围、臀围等测量的姿势、设备与记录流程。',
      limitation: '手册服务于健康调查测量；本站只借鉴观察条件，不根据外观推断体重、体脂或健康。'
    },
    'eu-cosmetics-1223-2009': {
      type: '法规',
      title: 'Regulation (EC) No 1223/2009',
      subtitle: 'European Union regulation on cosmetic products',
      organization: 'European Parliament and Council',
      url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32009R1223',
      scope: '化妆品定义、适用部位、产品类别、安全和标签的法规边界。',
      limitation: '法规类别用于校准产品范围，不等同本站面向检索建立的细分产品词表。'
    },
    'fda-cosmetic-product-codes': {
      type: '监管分类',
      title: 'FDA Cosmetic Products - Industry Code 53',
      subtitle: 'Cosmetic classes, subclasses and product examples',
      organization: 'U.S. Food and Drug Administration',
      url: 'https://www.accessdata.fda.gov/scripts/ora/pcb/tutorial/?action=tutorial.lesson4c',
      scope: '眼妆、非眼部彩妆、修甲产品等监管产品类别与示例。',
      limitation: '用于核对产品大类；质地、妆效、流行风格仍是本站编辑维度。'
    },
    'fda-color-additives': {
      type: '监管数据库',
      title: 'Regulatory Status of Color Additives',
      subtitle: 'Color additives permitted or restricted for cosmetics',
      organization: 'U.S. Food and Drug Administration',
      url: 'https://hfpappexternal.fda.gov/scripts/fdcc/index.cfm?set=ColorAdditives',
      scope: '化妆品着色剂的许可状态、用途部位与使用限制。',
      limitation: '本站色卡是视觉检索用通用色名，不表示具体配方含有某种获批着色剂。'
    },
    'eu-cosing': {
      type: '官方数据库',
      title: 'CosIng - Cosmetics Ingredients',
      subtitle: 'European Commission cosmetic ingredient database',
      organization: 'European Commission',
      url: 'https://ec.europa.eu/growth/tools-databases/cosing/',
      scope: '化妆品成分、INCI 通用名称、功能与欧盟法规附件信息。',
      limitation: 'CosIng 为信息数据库，成分被收录不等同获准使用；本站当前也不进行配方安全评价。'
    },
    'iso-22715': {
      type: '国际标准',
      title: 'ISO 22715:2006',
      subtitle: 'Cosmetics - Packaging and labelling',
      organization: 'International Organization for Standardization',
      url: 'https://www.iso.org/obp/ui/#!iso:std:36436:en',
      scope: '化妆品初级/次级包装定义以及包装和标签信息框架。',
      limitation: '用于理解包装与标签字段，不证明某一品牌产品在任一市场持续在售或合规。'
    },
    'face-atlas-editorial-protocol': {
      type: '内部规范',
      title: 'Face Atlas 标签编辑与复核协议',
      subtitle: '描述优先、维度拆分、边界声明与冲突检查',
      organization: 'Face Atlas',
      url: './methodology.html#editorial-protocol',
      scope: '统一标签命名、定义、观察角度、共存规则、易混项和非诊断边界。',
      limitation: '属于编辑质量控制，不代表外部专家、临床或同行评审。'
    },
    'beauty-atlas-editorial-taxonomy': {
      type: '内部规范',
      title: 'Beauty Atlas 美妆分类与术语协议',
      subtitle: '产品形态、色彩、质地妆效、妆容风格与美甲样式',
      organization: 'Face Atlas',
      url: './methodology.html#beauty-source-matrix',
      scope: '将监管大类和市场常用词拆成可搜索、可比较的编辑标签。',
      limitation: '妆效、风格和美甲名称没有统一全球标准；边界是资料库约定，不是监管认定。'
    }
  };

  const modules = {
    face: {
      reviewedAt: '2026-10-09',
      reviewStatus: 'editorial-reviewed',
      reviewLabel: '已完成编辑复核',
      reviewNote: '已核对命名、定义、观察条件、易混项、来源适用范围与非诊断边界；尚未进行逐条外部专家审核。',
      defaultSources: ['craniofacial-digital-anthropometry', 'face-atlas-editorial-protocol'],
      rules: [
        {
          match: item => ['肤色明度', '底调与表层色调', '色素、斑点与肤色均匀度'].includes(item.dimension),
          sources: ['iso-cie-11664-4', 'cie-256-skin-colour']
        },
        {
          match: item => ['皮肤纹理与毛孔', '色素、斑点与肤色均匀度', '泛红、瑕疵与痘痘观感'].includes(item.dimension),
          sources: ['aad-acne-signs']
        },
        { match: item => ['脸型与整体轮廓', '面部比例与侧貌'].includes(item.part), sources: ['iso-7250-1'] },
        {
          match: item => ['测量型', '比例型', '测量/结构型', '立体/测量型', '关系型', '立体/关系型'].includes(item.type),
          sources: ['iso-7250-1']
        },
        {
          match: item => ['颜色型', '颜色/比例型', '颜色/状态型'].includes(item.type),
          sources: ['iso-cie-11664-4']
        }
      ]
    },
    body: {
      reviewedAt: '2026-10-10',
      reviewStatus: 'editorial-reviewed',
      reviewLabel: '已完成编辑复核',
      reviewNote: '已核对肩、腰、髋、躯干和四肢的观察区间、宽度维度、中间参照、中性表述及维度级来源映射；尚未建立群体测量常模。',
      defaultSources: ['face-atlas-editorial-protocol'],
      rules: [
        {
          match: item => ['肩髋宽度关系', '肩部宽度', '左右状态', '躯干长度', '腰线位置', '髋部宽度', '上下身比例', '腿部分段', '臂展比例', '手臂整体长度', '手臂分段', '颈部长度', '踝部粗细', '头身比例', '手指相对长度', '手掌相对宽度', '足长相对长度', '肩斜角', '腰臀比', '腰段长度', '手腕粗细', '前掌相对宽度'].includes(item.dimension),
          sources: ['iso-7250-1', 'nhanes-anthropometry-2021']
        },
        {
          match: item => ['组合轮廓', '肩线方向', '肩部外轮廓', '腰部曲线', '髋线位置', '髋部外轮廓', '量感位置', '腿部量感分布', '四肢整体量感', '小腿肚位置'].includes(item.dimension),
          sources: ['iso-15535']
        }
      ]
    },
    beauty: {
      reviewedAt: '2026-10-08',
      reviewStatus: 'editorial-reviewed',
      reviewLabel: '已完成来源分层复核',
      reviewNote: '监管与标准来源用于产品边界、色彩和包装字段；妆效、风格与美甲名称属于编辑词表，品牌产品以官网或可信零售商页面为准。',
      defaultSources: ['eu-cosmetics-1223-2009', 'beauty-atlas-editorial-taxonomy'],
      rules: [
        { match: (_, context) => ['products', 'brandProducts'].includes(context.mode), sources: ['fda-cosmetic-product-codes'] },
        { match: (_, context) => ['brands', 'brandProducts'].includes(context.mode), sources: ['iso-22715'] },
        { match: (_, context) => context.mode === 'shades', sources: ['iso-cie-11664-4', 'fda-color-additives'] },
        { match: (_, context) => ['products', 'shades', 'finishes'].includes(context.mode), sources: ['eu-cosing'] },
        { match: (_, context) => context.mode === 'nails', sources: ['fda-cosmetic-product-codes'] }
      ]
    }
  };

  function resolve(item, moduleName, context = {}) {
    const module = modules[moduleName];
    if (!module) return null;
    const sourceKeys = [...module.defaultSources];
    module.rules.forEach(rule => {
      if (rule.match(item, context)) sourceKeys.push(...rule.sources);
    });
    return {
      ...module,
      sources: [...new Set(sourceKeys)].map(key => ({ key, ...sources[key] })).filter(Boolean)
    };
  }

  window.FACE_ATLAS_PROVENANCE = { sources, modules, resolve };
})();
