const CHARACTERS = {
  alice2: {
    name: '有栖',
    position: 'left',
    defaultPortrait: 'normal1',
    portraits: {
      normal1: 'novels/image_alice11.png',
      normal2: 'novels/image_alice12.png',
      normal3: 'novels/image_alice13.png',
      normal4: 'novels/image_alice14.png',
    },
  },
  nefar: {
    name: 'ニーファ',
    position: 'right',
    defaultPortrait: 'normal1',
    portraits: {
      normal1: 'novels/image_nefa01.png',
      normal2: 'novels/image_nefa02.png',
      normal3: 'novels/image_nefa03.png',
      normal4: 'novels/image_nefa04.png',
      normal5: 'novels/image_nefa05.png',
    },
  },
  alice3: {
    name: 'アリス',
    position: 'right',
    defaultPortrait: 'normal',
    portraits: {
      normal: 'newchar_normal.png',
    },
  }
};

const SCRIPT = [
  { command: 'background', value: 'novels/back24.jpg', position: 'bottom' },
  { command: 'font', family: 'Kaisei Decol', sizePC: '2.0rem', sizeSP: '1.5rem' },
  { command: 'bgm', value: 'SND_14_BIGPOINT2.mp3' },
  { speaker: '', portrait: '', text: '巨大な壁が崩れる' },
  { speaker: '', portrait: '', text: '砕けた光が宇宙へ散っていく' },
  { speaker: '', portrait: '', text: '視界は白く霞む' },
  { speaker: '', portrait: '', text: '立っている感覚もない' },
  { speaker: '', portrait: '', text: 'ただ静かな光だけが広がっていた' },
  { speaker: '', portrait: '', text: 'その光の向こうに、\n一人の少女がいた' },
  { command: 'bg_scroll', direction: 'down', speed: 200, loop: false },
  { command: 'wait', duration: 5000 },
  { speaker: 'アリス', portrait: 'normal', text: '有栖？' },
  { speaker: '有栖', portrait: 'normal1', text: '私を知ってるの？' },
  { speaker: 'アリス', portrait: 'normal', text: 'ずっと知ってるよ' },
  { speaker: '有栖', portrait: 'normal1', text: '不思議、私も' },
  { command: 'dialog_hide' },
  { command: 'wait', duration: 2000 },
  { command: 'whiteout' },
  { command: 'background', value: 'novels/back25.jpg', position: 'bottom' },
  { command: 'wait', duration: 2000 },
  { command: 'fadein' },
  { command: 'bg_scroll', direction: 'down', speed: 200, loop: false },
  { speaker: '', portrait: '', text: '有栖とアリスを分けていた線―' },
  { speaker: '', portrait: '', text: '現実と空想―' },
  { speaker: '', portrait: '', text: '過去と未来―' },
  { speaker: '', portrait: '', text: '傷と希望―' },
  { speaker: '', portrait: '', text: '境界が溶け合う―' },
  { speaker: '', portrait: '', text: 'そして―' },
  { command: 'dialog_hide' },
  { command: 'wait', duration: 2000 },
  { command: 'whiteout' },
  { command: 'background', value: 'novels/back26.jpg', position: 'top' },
  { command: 'wait', duration: 2000 },
  { command: 'fadein' },
  { command: 'wait', duration: 4000 },
  { command: 'bgm_fade', duration: 2000 },
];

NovelEngine.init({
  characters:  CHARACTERS,
  imagePath:   '../assets/images/',
  bgmPath:     '../assets/audio/',
  sePath:      'se/',
  typingSpeed: 30,
  clickSE:     'click.wav',
  saveStageField: 'unlockedStage2',
  nextUrl:     '../endrole_release2.html',
});

NovelEngine.play(SCRIPT);