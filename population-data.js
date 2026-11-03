(() => {
  const entries = [
    ['中国', '亚洲', 'China 中国', '中国男性图例有轻微胡茬，观察嘴唇和下颌时注意遮挡。'],
    ['日本', '亚洲', 'Japan 日本', ''],
    ['韩国', '亚洲', 'Korea 韩国', '女性图例选用柔和微笑的 B 候选；单眼皮只描述该个体。'],
    ['东南亚大陆', '亚洲', 'Thailand Vietnam 泰国 越南 东南亚', ''],
    ['东南亚海岛', '亚洲', 'Indonesia Philippines 印度尼西亚 菲律宾 东南亚', ''],
    ['南亚北部', '亚洲', 'India Pakistan 印度 巴基斯坦 南亚', '男性有胡茬，下颌轮廓与唇周皮肤可能被遮挡。'],
    ['南亚南部', '亚洲', 'India Sri Lanka 印度 斯里兰卡 南亚', '男性有胡茬，下颌轮廓与唇周皮肤可能被遮挡。'],
    ['中亚', '亚洲', 'Kazakhstan Uzbekistan 哈萨克斯坦 乌兹别克斯坦 中亚', ''],
    ['西亚', '亚洲', 'Levant 黎凡特 西亚', ''],
    ['北非', '非洲', 'Morocco Egypt 摩洛哥 埃及 北非', ''],
    ['西非', '非洲', 'Ghana Senegal 加纳 塞内加尔 西非', ''],
    ['东非', '非洲', 'Ethiopia Kenya 埃塞俄比亚 肯尼亚 东非', ''],
    ['北欧', '欧洲', 'Scandinavia 斯堪的纳维亚 北欧', ''],
    ['南欧', '欧洲', 'Italy Greece 意大利 希腊 南欧', ''],
    ['安第斯原住民', '美洲', 'Andean 安第斯 原住民 美洲', ''],
    ['波利尼西亚', '大洋洲', 'Samoa Tonga 萨摩亚 汤加 波利尼西亚', ''],
    ['英国与爱尔兰', '欧洲', 'United Kingdom Ireland 英国 爱尔兰 British Irish 红发 雀斑', '新图例待审阅；男性有轻微胡茬。'],
    ['西欧', '欧洲', 'France Belgium 法国 比利时 Western Europe 西欧', '新图例待审阅；男性有轻微胡茬。'],
    ['中欧', '欧洲', 'Germany Austria 德国 奥地利 Central Europe 中欧', '新图例待审阅；男性唇周有胡茬。'],
    ['东欧', '欧洲', 'Ukraine Poland 乌克兰 波兰 Eastern Europe 东欧', '新图例待审阅；男性有轻微胡茬。'],
    ['波罗的海', '欧洲', 'Latvia Lithuania Estonia 拉脱维亚 立陶宛 爱沙尼亚 Baltic 波罗的海', '新图例待审阅；本轮尚无爱沙尼亚单独图例。'],
    ['巴尔干', '欧洲', 'Serbia Croatia 塞尔维亚 克罗地亚 Balkans 巴尔干', '新图例待审阅；男性唇周有胡茬。'],
    ['北美·欧洲祖源', '美洲', 'USA Canada 美国 加拿大 欧洲祖源 North America European ancestry 北美 欧美', '新图例待审阅；祖源来自虚构设定，不能从图片核实。'],
    ['北美·非洲祖源', '美洲', 'USA Canada 美国 加拿大 非洲祖源 North America African ancestry 北美 非裔', '新图例待审阅；祖源来自虚构设定，不能从图片核实。'],
    ['墨西哥及中美洲', '美洲', 'Mexico Guatemala 墨西哥 危地马拉 Central America 中美洲 拉美', '新图例待审阅；男性有轻微胡茬。'],
    ['巴西', '美洲', 'Brazil Brazilian 巴西 巴西人 South America 南美洲 拉美', '新图例待审阅；未指定家族祖源，男性有轻微胡茬。']
  ];
  window.POPULATION_ATLAS = {
    status: 'published',
    regions: entries.map(([label, group, search, note], index) => {
      const number = String(index + 1).padStart(2, '0');
      return {
        id: `RG-${number}`, number, label, group, search, note,
        info: window.POPULATION_INFO.records[index],
        isNew: index >= 16,
        assets: ['female', 'male'].map(sex => ({
          sex, src: `assets/population/rg-${number}-${sex}-framed.webp`,
          details: {
            full: `assets/population/rg-${number}-${sex}-framed.webp`,
            eye: `assets/population/rg-${number}-${sex}-eye.webp`,
            nose: `assets/population/rg-${number}-${sex}-nose.webp`,
            lip: `assets/population/rg-${number}-${sex}-lip.webp`
          },
          origin: 'AI-generated fictional adult', representsPopulationAverage: false
        }))
      };
    })
  };
})();
