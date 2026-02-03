// Wordle Clone - Core gameplay (MVP)
// Uses simple, self-contained vanilla JS. Replace word lists for production.

const NUM_ROWS = 6;
const NUM_COLS = 5;
const STORAGE_KEY = 'wordle_clone_state_v1';
const GAME_META_KEY = 'wordle_clone_meta_v1';

let ANSWERS = [];
let VALID = new Set();
let todayAnswer = '';
let gameState = null; // {guesses:[], row, status: 'playing'|'win'|'loss'}

// --- Utilities ---
function $(sel){return document.querySelector(sel)}
function createEl(tag, cls){const el = document.createElement(tag); if(cls) el.className = cls; return el}

// --- Load word lists (local JSON) ---
async function loadWordLists(){
  try{
    const ansResp = await fetch('words/answers.json');
    ANSWERS = await ansResp.json();
    const validResp = await fetch('words/valid-guesses.json');
    const validList = await validResp.json();
    validList.forEach(w => VALID.add(w.toLowerCase()));
  }catch(e){
    console.error('Failed to load word lists', e);
    showMessage('Failed to load word lists. Check network or files.');
  }
}

function getTodayIndex(){
  // Fixed epoch to ensure same word across clients
  const epoch = new Date(Date.UTC(2022,0,1)); // Jan 1, 2022
  const today = new Date();
  const days = Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - epoch.getTime()) / (1000*60*60*24));
  return days % ANSWERS.length;
}

function pickTodayAnswer(){
  if(!ANSWERS.length) return 'panel';
  const idx = getTodayIndex();
  return ANSWERS[idx].toLowerCase();
}

// --- DOM setup ---
function buildGrid(){
  const grid = $('#game-grid');
  grid.innerHTML = '';
  for(let r=0;r<NUM_ROWS;r++){
    const row = createEl('div','row');
    row.dataset.row = r;
    for(let c=0;c<NUM_COLS;c++){
      const tile = createEl('div','tile');
      tile.dataset.col = c;
      tile.dataset.row = r;
      tile.tabIndex = 0;
      const letter = createEl('div','letter');
      tile.appendChild(letter);
      row.appendChild(tile);
    }
    grid.appendChild(row);
  }
}

function buildKeyboard(){
  const layout = ['qwertyuiop','asdfghjkl','zxcvbnm'];
  const kb = $('#keyboard');
  kb.innerHTML = '';
  layout.forEach((rowStr, i) =>{
    const row = createEl('div','k-row');
    for(const ch of rowStr){
      const key = createEl('button','key');
      key.textContent = ch;
      key.dataset.key = ch;
      key.addEventListener('click', () => handleKey(ch));
      row.appendChild(key);
    }
    if(i===2){
      const enter = createEl('button','key wide'); enter.textContent='ENTER'; enter.dataset.key='Enter'; enter.addEventListener('click',()=>handleKey('Enter'));
      const back = createEl('button','key wide'); back.textContent='⌫'; back.dataset.key='Backspace'; back.addEventListener('click',()=>handleKey('Backspace'));
      row.prepend(enter);
      row.appendChild(back);
    }
    kb.appendChild(row);
  });
}

// --- State management ---
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      // Ensure this is for today's puzzle
      if(parsed.answerDate === getAnswerDate()){
        gameState = parsed;
      }
    }
  }catch(e){
    console.warn('Failed to load state', e);
  }
  if(!gameState){
    gameState = {
      guesses:[],
      row:0,
      status:'playing',
      answer: todayAnswer,
      answerDate:getAnswerDate(),
      powerups:{
        left:2,            // total power-ups left for this game
        hints:[],         // {row,pos,letter}
        eliminated:[]     // letters eliminated by Skip
      }
    };
    saveState();
  } else {
    // Backwards compatibility: ensure powerups object exists
    if(!gameState.powerups) gameState.powerups = { left:2, hints:[], eliminated:[] };
  }
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
  }catch(e){
    console.warn('Could not save state to localStorage', e);
    showMessage('Could not save game state. Local storage may be full.');
  }
}

function getAnswerDate(){
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`;
}

// --- UI helpers ---
function setTile(r,c,char){
  const tile = document.querySelector(`.tile[data-row='${r}'][data-col='${c}'] .letter`);
  if(tile) tile.textContent = char.toUpperCase();
}

function clearRow(r){
  for(let c=0;c<NUM_COLS;c++) setTile(r,c,'');
}

function showMessage(msg, timeout=2000){
  const el = $('#message');
  el.textContent = msg;
  if(timeout) setTimeout(()=>{if(el.textContent===msg) el.textContent=''}, timeout);
}

// --- Input handling ---
let currentGuess = '';
function handleKey(key){
  if(gameState.status !== 'playing') return;
  if(key === 'Enter') return submitGuess();
  if(key === 'Backspace') return deleteLetter();
  if(/^[a-z]$/.test(key)) return addLetter(key);
}

function addLetter(ch){
  if(currentGuess.length >= NUM_COLS) return;
  currentGuess += ch;
  const r = gameState.row;
  setTile(r, currentGuess.length-1, ch);
}

function deleteLetter(){
  if(!currentGuess.length) return;
  const r = gameState.row;
  setTile(r, currentGuess.length-1, '');
  currentGuess = currentGuess.slice(0,-1);
}

async function submitGuess(){
  if(currentGuess.length !== NUM_COLS){
    // shake
    const rowEl = document.querySelector(`.row[data-row='${gameState.row}']`);
    rowEl.classList.add('shake');
    setTimeout(()=>rowEl.classList.remove('shake'),700);
    showMessage('Not enough letters');
    return;
  }
  const guessLower = currentGuess.toLowerCase();
  if(!VALID.has(guessLower) && !ANSWERS.includes(guessLower)){
    const rowEl = document.querySelector(`.row[data-row='${gameState.row}']`);
    rowEl.classList.add('shake');
    setTimeout(()=>rowEl.classList.remove('shake'),700);
    showMessage('Word not in list');
    return;
  }

  // Mark tiles (green then yellow handling duplicates)
  const result = evaluateGuess(guessLower, todayAnswer);

  // reveal with flip animation sequentially
  for(let c=0;c<NUM_COLS;c++){
    const tile = document.querySelector(`.tile[data-row='${gameState.row}'][data-col='${c}']`);
    tile.classList.add('flip');
    // apply class after a delay to sync with flip
    await new Promise(res => setTimeout(res, 250));
    tile.classList.remove('flip');
    tile.classList.add(result[c]);
    // update keyboard
    updateKeyColor(guessLower[c], result[c]);
  }

  // Save guess
  gameState.guesses.push({word:guessLower, result});
  saveState();

  // Check win/loss
  if(result.every(r=>r==='green')){
    gameState.status='win';
    saveState();
    showWin();
    return;
  }

  gameState.row++;
  currentGuess='';
  if(gameState.row >= NUM_ROWS){
    gameState.status='loss';
    saveState();
    showLoss();
    return;
  }
}

function updateKeyColor(ch, color){
  const key = document.querySelector(`.key[data-key='${ch}']`);
  if(!key) return;
  // priority green > yellow > gray
  if(color==='green'){
    key.classList.remove('yellow','gray'); key.classList.add('green');
  }else if(color==='yellow'){
    if(!key.classList.contains('green')){ key.classList.remove('gray'); key.classList.add('yellow') }
  }else if(color==='gray'){
    if(!key.classList.contains('green') && !key.classList.contains('yellow')){ key.classList.add('gray') }
  }
}

function showWin(){
  showMessage('You win! 🎉', 5000);
  // bounce animation
  const row = gameState.guesses.length - 1;
  for(let c=0;c<NUM_COLS;c++){
    const tile = document.querySelector(`.tile[data-row='${row}'][data-col='${c}']`);
    tile.classList.add('win');
    setTimeout(()=>tile.classList.remove('win'), 1200);
  }
  updatePowerupUI();
}
function showLoss(){
  showMessage(`You lost. Answer: ${todayAnswer.toUpperCase()}`, 8000);
  updatePowerupUI();
}

// --- Evaluation logic with duplicates handling ---
function evaluateGuess(guess, answer){
  const res = Array(NUM_COLS).fill('gray');
  const answerChars = answer.split('');
  // First pass - greens
  for(let i=0;i<NUM_COLS;i++){
    if(guess[i] === answer[i]){ res[i] = 'green'; answerChars[i] = null; }
  }
  // Count remaining
  const counts = {};
  for(const ch of answerChars){ if(ch){ counts[ch] = (counts[ch]||0)+1 }}
  // Second pass - yellows
  for(let i=0;i<NUM_COLS;i++){
    if(res[i]==='green') continue;
    const ch = guess[i];
    if(counts[ch]){ res[i] = 'yellow'; counts[ch]--; }
  }
  return res;
}

// --- Keyboard (physical) support ---
window.addEventListener('keydown', e => {
  if(e.key === 'Escape') closeModal();
  if(e.key === 'Enter' || e.key === 'Backspace' || /^[a-zA-Z]$/.test(e.key)){
    e.preventDefault();
    handleKey(e.key === 'Backspace' ? 'Backspace' : (e.key === 'Enter' ? 'Enter' : e.key.toLowerCase()));
  }
});

// --- Modal ---
function openModal(html){
  const m = $('#modal');
  $('#modal-body').innerHTML = html;
  m.classList.remove('hidden');
  m.setAttribute('aria-hidden','false');
}
function closeModal(){
  const m = $('#modal');
  m.classList.add('hidden');
  m.setAttribute('aria-hidden','true');
}
$('#help-btn').addEventListener('click', ()=>{
  openModal(`<h2>How to play</h2><p>Guess the 5-letter word in 6 tries. Colors show letter matches.</p><p><strong>Green</strong> - correct place. <strong>Yellow</strong> - present but wrong place. <strong>Gray</strong> - not present.</p>`);
});
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e)=>{ if(e.target === $('#modal')) closeModal(); });

// --- Power-ups (Hint / Swap / Skip) ---
const hintBtn = $('#hint-btn');
const swapBtn = $('#swap-btn');
const skipBtn = $('#skip-btn');
const powerupLeftEl = $('#powerup-left');
let swapActive = false;
let swapSelections = []; // selected column indices

function updatePowerupUI(){
  powerupLeftEl.textContent = gameState.powerups.left;
  const disabledAll = gameState.status !== 'playing' || gameState.powerups.left <= 0;
  hintBtn.disabled = disabledAll;
  swapBtn.disabled = disabledAll;
  skipBtn.disabled = disabledAll;
  // visual disabled state
  hintBtn.classList.toggle('disabled', hintBtn.disabled);
  swapBtn.classList.toggle('disabled', swapBtn.disabled);
  skipBtn.classList.toggle('disabled', skipBtn.disabled);
}

function applySavedPowerups(){
  // Apply any saved hint reveals (may be on earlier row or current)
  for(const h of gameState.powerups.hints){
    const {row,pos,letter} = h;
    setTile(row,pos,letter);
    const tile = document.querySelector(`.tile[data-row='${row}'][data-col='${pos}']`);
    if(tile) tile.classList.add('green','hint');
    updateKeyColor(letter, 'green');
  }
  // Apply eliminated keys
  for(const ch of gameState.powerups.eliminated){
    const key = document.querySelector(`.key[data-key='${ch}']`);
    if(key){ key.classList.add('eliminated'); key.disabled = true; }
  }
}

function useHint(){
  if(gameState.powerups.left <= 0 || gameState.status !== 'playing') return;
  const row = gameState.row;
  // find positions not already revealed (no green in previous guesses at that pos and not already hinted)
  const alreadyGreen = new Set();
  for(const g of gameState.guesses){
    for(let i=0;i<NUM_COLS;i++) if(g.result[i] === 'green') alreadyGreen.add(i);
  }
  // also positions already hinted
  const hinted = new Set(gameState.powerups.hints.filter(h=>h.row===row).map(h=>h.pos));
  const candidates = [];
  for(let i=0;i<NUM_COLS;i++){
    if(alreadyGreen.has(i)) continue;
    if(hinted.has(i)) continue;
    if(todayAnswer[i] === undefined) continue;
    // if current guess already has correct letter at pos, skip
    if(currentGuess[i] && currentGuess[i] === todayAnswer[i]) continue;
    candidates.push(i);
  }
  if(candidates.length === 0){ showMessage('No position available for hint'); return; }
  const pos = candidates[Math.floor(Math.random()*candidates.length)];
  const letter = todayAnswer[pos];
  // place letter into current row
  setTile(row,pos,letter);
  // update currentGuess at that position (ensure array length)
  const arr = currentGuess.split('');
  while(arr.length < NUM_COLS) arr.push('');
  arr[pos] = letter;
  currentGuess = arr.join('').slice(0,NUM_COLS);
  // apply green class and mark hint
  const tile = document.querySelector(`.tile[data-row='${row}'][data-col='${pos}']`);
  if(tile){ tile.classList.add('green','hint'); }
  updateKeyColor(letter,'green');
  gameState.powerups.hints.push({row,pos,letter});
  gameState.powerups.left -= 1;
  saveState();
  updatePowerupUI();
  showMessage('Hint used — one letter revealed');
}

function useSkip(){
  if(gameState.powerups.left <= 0 || gameState.status !== 'playing') return;
  // pick a random letter not in answer and not already eliminated
  const answerSet = new Set(todayAnswer.split(''));
  const eliminatedSet = new Set(gameState.powerups.eliminated);
  const candidates = [];
  for(let i=0;i<26;i++){
    const ch = String.fromCharCode(97 + i);
    if(answerSet.has(ch)) continue;
    if(eliminatedSet.has(ch)) continue;
    // skip keys already colored as gray/green/yellow — but gray is acceptable only if not in answer; we'll avoid keys that already have classes
    const keyEl = document.querySelector(`.key[data-key='${ch}']`);
    if(keyEl && (keyEl.classList.contains('green') || keyEl.classList.contains('yellow') || keyEl.classList.contains('eliminated') || keyEl.classList.contains('gray'))) continue;
    candidates.push(ch);
  }
  if(candidates.length === 0){ showMessage('No letter available to eliminate'); return; }
  const chosen = candidates[Math.floor(Math.random()*candidates.length)];
  // mark key eliminated
  const key = document.querySelector(`.key[data-key='${chosen}']`);
  if(key){ key.classList.add('eliminated'); key.disabled = true; }
  gameState.powerups.eliminated.push(chosen);
  gameState.powerups.left -= 1;
  saveState();
  updatePowerupUI();
  showMessage(`Letter ${chosen.toUpperCase()} eliminated`);
}

function enterSwapMode(){
  if(gameState.powerups.left <= 0 || gameState.status !== 'playing') return;
  if(swapActive){ // cancel
    cancelSwap();
    return;
  }
  // ensure there are at least two letters in current guess
  const filled = currentGuess.split('').filter(Boolean).length;
  if(filled < 2){ showMessage('Need at least two letters in current guess to swap'); return; }
  swapActive = true;
  swapSelections = [];
  swapBtn.textContent = 'Swap: select 2';
  showMessage('Select two letters in the active row to swap, or press Swap to cancel', 4000);
}

function cancelSwap(){
  swapActive = false;
  swapSelections = [];
  // remove selected visuals
  document.querySelectorAll('.tile.selected').forEach(t=>t.classList.remove('selected'));
  swapBtn.textContent = 'Swap';
  showMessage('Swap cancelled');
}

function tileSwapClickHandler(e){
  if(!swapActive) return;
  const tile = e.currentTarget;
  const row = Number(tile.dataset.row);
  const col = Number(tile.dataset.col);
  if(row !== gameState.row) return; // only active row
  const letterEl = tile.querySelector('.letter');
  if(!letterEl || !letterEl.textContent.trim()) { showMessage('Select a tile with a letter'); return; }
  // toggle selection
  if(tile.classList.contains('selected')){
    tile.classList.remove('selected');
    swapSelections = swapSelections.filter(i=>i!==col);
  } else {
    if(swapSelections.length >= 2){ showMessage('Already selected two tiles'); return; }
    tile.classList.add('selected');
    swapSelections.push(col);
  }
  if(swapSelections.length === 2){
    swapBtn.textContent = 'Confirm Swap';
  }
}

function confirmSwap(){
  if(!swapActive) return;
  if(swapSelections.length !== 2){ showMessage('Select two letters to swap'); return; }
  const [a,b] = swapSelections;
  // ensure both positions have letters
  const arr = currentGuess.split('');
  const la = arr[a] || '';
  const lb = arr[b] || '';
  if(!la || !lb){ showMessage('Both positions must have letters'); return; }
  // swap
  arr[a] = lb; arr[b] = la;
  currentGuess = arr.join('').slice(0,NUM_COLS);
  // update tiles
  setTile(gameState.row,a,arr[a]); setTile(gameState.row,b,arr[b]);
  // cleanup
  cancelSwap();
  gameState.powerups.left -= 1;
  saveState();
  updatePowerupUI();
  showMessage('Swap applied');
}

// Attach tile click handlers for swap selection
function attachTileSwapHandlers(){
  document.querySelectorAll('.tile').forEach(t => {
    t.removeEventListener('click', tileSwapClickHandler);
    t.addEventListener('click', tileSwapClickHandler);
  });
}

// Prevent typing while swap active
const originalHandleKey = handleKey;
function handleKeyWrapper(key){
  if(swapActive){ showMessage('Finish or cancel the swap first'); return; }
  // prevent typing eliminated letters
  if(/^[a-z]$/.test(key) && gameState.powerups.eliminated.includes(key)){
    showMessage('Letter has been eliminated'); return;
  }
  originalHandleKey(key);
}
// override handleKey reference used by keyboards
handleKey = handleKeyWrapper;

// Hook power-up buttons
hintBtn.addEventListener('click', useHint);
swapBtn.addEventListener('click', ()=>{
  if(swapActive && swapSelections.length===2){ confirmSwap(); }
  else enterSwapMode();
});
skipBtn.addEventListener('click', useSkip);

// --- Initialization ---
async function init(){
  buildGrid();
  buildKeyboard();
  await loadWordLists();
  todayAnswer = pickTodayAnswer();
  loadState();
  // restore past guesses UI
  for(let r=0;r<gameState.guesses.length;r++){
    const g = gameState.guesses[r];
    for(let c=0;c<NUM_COLS;c++){
      setTile(r,c,g.word[c]);
      const tile = document.querySelector(`.tile[data-row='${r}'][data-col='${c}']`);
      tile.classList.add(g.result[c]);
      updateKeyColor(g.word[c], g.result[c]);
    }
  }
  // Apply and initialize powerups after the board is restored
  applySavedPowerups();
  updatePowerupUI();
  attachTileSwapHandlers();

  if(gameState.status === 'win') showMessage('You already won today! 🎉', 4000);
  if(gameState.status === 'loss') showMessage(`You lost. Answer: ${todayAnswer.toUpperCase()}`, 8000);
}

init();

// Export for debugging
window._WC = {evaluateGuess};