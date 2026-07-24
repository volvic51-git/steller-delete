const CHARACTERS = {
  alice: {
    name: 'アリス',
    position: 'left',
    defaultPortrait: 'normal1',
    portraits: {
      normal1: 'novels/image_alice01.png',
      normal2: 'novels/image_alice02.png',
      normal3: 'novels/image_alice03.png',
    },
  },
  flat: {
    name: 'フラット',
    position: 'right',
    defaultPortrait: 'normal1',
    portraits: {
      normal1: 'novels/image_flat01.png',
      normal2: 'novels/image_flat02.png',
      normal3: 'novels/image_flat03.png',
    },
  },
  ruge: {
    name: 'ルージュ',
    position: 'right',
    defaultPortrait: 'normal',
    portraits: {
      normal1: 'novels/image_ruge01.png',
    },
  }
};

const SCRIPT = [
  { command: 'background', value: 'novels/back01.jpg' },
  { command: 'bgm', value: 'bgm01.mp3' },
  { command: 'font', family: 'Kaisei Decol', sizePC: '2.0rem', sizeSP: '1.5rem' },
  { command: 'show', character: 'alice', portrait: 'normal1' },
  { speaker: 'アリス', portrait: 'normal1', text: '終わったわね。' },
  { command: 'show', character: 'ruge', portrait: 'normal1' },
  { speaker: 'ルージュ', portrait: 'normal1', text: '助けてくれてありがとう。' },
  { speaker: 'アリス', portrait: 'normal1', text: 'どういたしまして。' },
  { speaker: 'ルージュ', portrait: 'normal1', text: 'お礼に骨を一本どうぞ。' },
  { speaker: 'アリス', portrait: 'normal1', text: 'いらないわ。' },
  { speaker: 'ルージュ', portrait: 'normal1', text: '遠慮しなくていいのに。' },
  { speaker: 'アリス', portrait: 'normal1', text: '本当にいらない。' },
  { speaker: 'ルージュ', portrait: 'normal1', text: 'じゃあ口紅にしておく？' },
  { speaker: 'アリス', portrait: 'normal1', text: '選択肢がおかしくない？' },
  { speaker: 'ルージュ', portrait: 'normal1', text: '骨味の口紅なんだけど。' },
  { speaker: 'アリス', portrait: 'normal1', text: '余計にいらないわ。' },
  { speaker: 'ルージュ', portrait: 'normal1', text: '人気あるのに？' },
  { speaker: 'アリス', portrait: 'normal1', text: '誰に？' },
  { speaker: 'ルージュ', portrait: 'normal1', text: '骨に。' },
  { speaker: 'アリス', portrait: 'normal1', text: '骨が口紅をするの？' },
  { speaker: 'ルージュ', portrait: 'normal1', text: 'むしろ骨以外はあまり使わないね。' },
  { speaker: 'アリス', portrait: 'normal2', text: '初耳だよ。' },
  { speaker: 'ルージュ', portrait: 'normal1', text: '耳があるうちにね。' },
  { command: 'fadeout' },
  { command: 'hide_all' },
  { command: 'hide', character: 'alice' },
  { command: 'hide', character: 'ruge' },
  { command: 'dialog_hide' },
  { command: 'background', value: 'novels/back03.jpg', position: 'bottom', positionMobile: '30% 0%' },
  { command: 'se', value: 'gogogo.wav' },
  { command: 'wait', duration: 2000 },
  { command: 'fadein' },
  { speaker: 'アリス', portrait: 'normal1', text: 'これが二つ目の星の檻ね。' },
  { speaker: 'アリス', portrait: 'normal1', text: '変な場所。こんなに緑ばかりだと、どれが景色でどれが緑なのかわからなくなるわ。' },
  { speaker: 'アリス', portrait: 'normal1', text: '葉っぱが風で揺れているのかしら。' },
  { speaker: 'アリス', portrait: 'normal1', text: 'それとも緑全体が何か内緒話をしているのかしら。' },
  { speaker: 'アリス', portrait: 'normal1', text: 'どちらでもあまり安心できないけれど。' },
  { speaker: 'アリス', portrait: 'normal1', text: 'でも「普通」より「変」のほうが、道案内に向いている気がしてきたわ。' },
  { command: 'dialog_hide' },
  { command: 'bg_scroll', direction: 'down', speed: 200, loop: false },
  { command: 'wait', duration: 2000 },
  { command: 'bgm_fade', duration: 2000 },
];

NovelEngine.init({
  characters:  CHARACTERS,
  imagePath:   '../assets/images/',
  bgmPath:     '../assets/audio/',
  sePath:      'se/',
  typingSpeed: 30,
  clickSE:     'click.wav',
  unlockStageOnComplete: 2,
  nextUrl:     '../index.html?select=1&storyStage=2',
});

NovelEngine.play(SCRIPT);