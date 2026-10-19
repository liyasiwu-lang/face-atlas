(() => {
  const sheet = (file, index, alt) => ({
    file: `./assets/examples/${file}`,
    x: ['0%', '33.333%', '66.667%', '100%'][index % 4],
    y: ['0%', '50%', '100%'][Math.floor(index / 4)],
    alt
  });

  const body = {};
  const addSheet = (file, names) => names.forEach((name, index) => {
    body[name] = sheet(file, index, `${name}的中性全身比例参考图例`);
  });
  const addGuides = guides => Object.entries(guides).forEach(([name, guide]) => {
    body[name] = {
      file: './assets/examples/body-reference-balanced-base.png',
      x: '50%',
      y: '50%',
      size: 'cover',
      alt: `${name}的中性全身比例参考图例，叠加测量导线`,
      guide
    };
  });

  addSheet('body-reference-01-v2-grid.webp', [
    'H形轮廓','A形轮廓','V形轮廓','X形轮廓',
    'O形轮廓','I形轮廓','8形轮廓','柔和X形轮廓',
    '肩宽于髋','肩髋等宽','肩窄于髋','平直肩线'
  ]);
  addSheet('body-reference-02-v2-grid.webp', [
    '下斜肩线','圆缓肩部','直角肩部','肩线轻度不对称',
    '长躯干','短躯干','均衡躯干比例','高腰线',
    '低腰线','腰部内收明显','腰部内收中等','腰部内收较小'
  ]);
  addSheet('body-reference-03-v2-grid.webp', [
    '高髋曲线','低髋曲线','外髋圆弧明显','外髋线条较直',
    '上髋量感较强','下髋量感较强','中等髋宽','髋线轻度不对称',
    '上下身比例均衡','腿部相对较长','腿部相对较短','大腿段相对较长'
  ]);
  addSheet('body-reference-04-v2-grid.webp', [
    '小腿段相对较长','大腿小腿分段均衡','臂展相对较长','臂展相对较短',
    '手臂相对较长','手臂相对较短','前臂相对较长','上臂相对较长',
    '大腿量感相对较强','小腿量感相对较强','四肢线条纤细','四肢线条饱满'
  ]);
  addSheet('body-reference-05-grid.webp', [
    '长颈','短颈','均衡颈长',
    '踝部相对较细','中等踝围','踝部相对较粗'
  ]);
  addSheet('body-reference-06-grid.webp', [
    '头大身小','头身比例均衡','头小身长','手指偏长',
    '手指长度均衡','手指偏短','手掌偏宽','手掌宽度均衡',
    '手掌偏窄','足部偏长','足长均衡','足部偏短'
  ]);
  [
    ['肩斜角较大',0],['肩斜角适中',1],['肩斜角较小',2],
    ['腰臀比偏大',4],['腰臀比适中',5],['腰臀比偏小',6],
    ['腰段偏长',8],['腰段适中',9],['腰段偏短',10]
  ].forEach(([name,index]) => body[name] = sheet('body-reference-07-grid.webp', index, `${name}的身形比例参考图例`));
  [
    ['手腕相对较细',0],['中等腕围',1],['手腕相对较粗',2],
    ['小腿肚位置偏高',4],['小腿肚位置适中',5],['小腿肚位置偏低',6],
    ['前掌相对较宽',8],['前掌宽度适中',9],['前掌相对较窄',10]
  ].forEach(([name,index]) => body[name] = sheet('body-reference-08-grid.webp', index, `${name}的身形比例参考图例`));
  addGuides({
    '自然肩线': 'shoulder-neutral',
    '中位腰线': 'waist-mid',
    '中位髋曲线': 'hip-mid',
    '臂展比例均衡': 'arm-span-balanced',
    '手臂长度均衡': 'arm-length-balanced',
    '上臂前臂分段均衡': 'arm-segments-balanced',
    '大腿小腿量感均衡': 'leg-volume-balanced',
    '四肢量感中等': 'limb-volume-medium',
    '肩部相对较宽': 'shoulder-width-wide',
    '中等肩宽': 'shoulder-width-medium',
    '肩部相对较窄': 'shoulder-width-narrow',
    '髋部相对较宽': 'hip-width-wide',
    '髋部相对较窄': 'hip-width-narrow',
    '上下髋量感均衡': 'hip-volume-balanced'
  });

  window.BODY_ATLAS_EXAMPLES = body;
})();
