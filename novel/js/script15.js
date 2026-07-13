const CHARACTERS = {
  alice2: {
    name: '有栖',
    position: 'left',
    defaultPortrait: 'normal',
    portraits: {
      normal: 'image_alice11.png',
    },
  },
  nefar: {
    name: 'ニーファ',
    position: 'right',
    defaultPortrait: 'normal',
    portraits: {
      normal: 'image_nefa01.png',
    },
  }
};

const SCRIPT = [
  { command: 'background', value: 'img_bg04.jpg' },
  { command: 'bgm', value: 'bgm01.mp3' },
  { command: 'show', character: 'alice2', portrait: 'normal' },
  { speaker: '有栖', portrait: 'normal', text: 'え、ここどこ？' },
  { command: 'show', character: 'nefar', portrait: 'normal' },
  { speaker: 'ニーファ', portrait: 'normal', text: 'ここはEP.15です。乙女の制限時間無効機構を解放します。' },
  { command: 'end' },
];

NovelEngine.init({
  characters:  CHARACTERS,
  imagePath:   '../assets/images/',
  bgmPath:     '../assets/audio/',
  sePath:      'se/',
  typingSpeed: 30,
  clickSE:     'click.wav',
  unlockStageOnComplete: 26,
  saveStageField: 'unlockedStage2',
  nextUrl:     '../index.html?select=1&storyStage=26',
});

NovelEngine.play(SCRIPT);