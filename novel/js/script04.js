const CHARACTERS = {
  alice: {
    name: 'アリス',
    position: 'left',
    defaultPortrait: 'normal1',
    portraits: {
      normal1: 'image_alice01.png',
      normal2: 'image_alice02.png',
      normal3: 'image_alice03.png',
    },
  },
  flat: {
    name: 'フラット',
    position: 'right',
    defaultPortrait: 'normal1',
    portraits: {
      normal1: 'image_flat01.png',
      normal2: 'image_flat02.png',
      normal3: 'image_flat03.png',
    },
  },
  darty: {
    name: 'ダーティー',
    position: 'right',
    defaultPortrait: 'normal1',
    portraits: {
      normal1: 'image_darty01.png',
    },
  }
};

const SCRIPT = [
  { command: 'background', value: 'back01.jpg' },
  { command: 'bgm', value: 'bgm01.mp3' },
  { command: 'font', family: 'Kaisei Decol', sizePC: '2.0rem', sizeSP: '1.0rem' },
  { command: 'show', character: 'alice', portrait: 'normal1' },
  { speaker: 'アリス', portrait: 'normal1', text: '助かってよかったわね。' },
  { command: 'show', character: 'darty', portrait: 'normal1' },
  { speaker: 'ダーティー', portrait: 'normal1', text: 'ええ。でも、はまぐりは閉じたままだわ。' },
  { speaker: 'アリス', portrait: 'normal1', text: 'はまぐりも捕まっていたの？' },
  { speaker: 'ダーティー', portrait: 'normal1', text: 'いいえ。だから心配なの。' },
  { speaker: 'アリス', portrait: 'normal1', text: '心配じゃない理由になってないわ。' },
  { speaker: 'ダーティー', portrait: 'normal1', text: '心配は理由より先に着くことがあるもの。' },
  { speaker: 'アリス', portrait: 'normal1', text: '変なの。' },
  { speaker: 'ダーティー', portrait: 'normal1', text: '変じゃないわ。はまぐりもそう言っていた。' },
  { speaker: 'アリス', portrait: 'normal1', text: 'はまぐりと話せるの？' },
  { speaker: 'ダーティー', portrait: 'normal1', text: '話したことはないけれど、意見は一致しているわ。' },
  { speaker: 'アリス', portrait: 'normal1', text: 'それなら私もはまぐりと意見が一致してるかもしれないわ。' },
  { speaker: 'ダーティー', portrait: 'normal1', text: '確かめてみる？' },
  { speaker: 'アリス', portrait: 'normal1', text: '・・・やめておくわ。' },
  { speaker: 'アリス', portrait: 'normal2', text: 'はまぐりが賛成したら負けた気がするもの。' },
  { command: 'fadeout' },
  { command: 'hide_all' },
  { command: 'hide', character: 'alice' },
  { command: 'hide', character: 'darty' },
  { command: 'dialog_hide' },
  { command: 'background', value: 'back05.jpg', position: 'bottom', positionMobile: '30% 0%' },
  { command: 'se', value: 'gogogo.wav' },
  { command: 'wait', duration: 2000 },
  { command: 'fadein' },
  { speaker: 'アリス', portrait: 'normal1', text: 'これが４つ目の星の檻ね。' },
  { speaker: 'アリス', portrait: 'normal1', text: 'ピカピカの星って、まるで空に咲く花みたい。' },
  { speaker: 'アリス', portrait: 'normal1', text: 'でも花と違って、手を伸ばしても摘むことができないのよね。' },
  { speaker: 'アリス', portrait: 'normal1', text: '見えるのに届かないなんて、なんとも不思議だわ。' },
  { speaker: 'アリス', portrait: 'normal2', text: 'でも手が届いてしまったら、星らしくなくなってしまうのかもしれないわね。' },
  { speaker: 'アリス', portrait: 'normal1', text: '遠くにあるからこそ星でいられるのなら、少し寂しいけれど素敵なことね。' },
  { speaker: 'アリス', portrait: 'normal1', text: '私も時々、遠くにいるほうが自分らしくいられる気がするもの。' },
  { speaker: 'アリス', portrait: 'normal1', text: '帰り道が、ますますわからなくなってしまうのだけれど。' },
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
  unlockStageOnComplete: 4,
  nextUrl:     '../index.html?select=1&storyStage=4',
});

NovelEngine.play(SCRIPT);