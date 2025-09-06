import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/controls/PointerLockControls.js';

// PWA service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}

const menu=document.getElementById('menu');
const gameScreen=document.getElementById('game');
const victoryScreen=document.getElementById('victory');
const leaderboardTable=document.getElementById('leaderboard');
const timerEl=document.getElementById('timer');
const topBtn=document.getElementById('topviewBtn');
const exitBtn=document.getElementById('exitBtn');
const returnTopBtn=document.getElementById('returnTopBtn');
const finalTimeEl=document.getElementById('finalTime');
const submitScoreBtn=document.getElementById('submitScore');
const menuBtn=document.getElementById('menuBtn');
const playerNameInput=document.getElementById('playerName');
const canvasContainer=document.getElementById('canvas-container');

let renderer,scene,camera,controls;
let maze,mazeSize,cellSize=5; // cell size units
let goalMesh;
let animationId;
let startTime, timerInterval;
let difficulty='easy';
let topView=false;
let topZones=[]; // cells allowing top view in medium
let playerPos={x:0,z:0};
let moveForward=0,moveRight=0;

const touchLeft=document.getElementById('touch-left');
const touchRight=document.getElementById('touch-right');
let leftTouchStart=null,rightTouchStart=null;

function loadLeaderboard(){
  const data=JSON.parse(localStorage.getItem('mazeScores')||'{}');
  const scores=data[difficulty]||[];
  leaderboardTable.innerHTML=scores.map(s=>`<tr><td>${s.name}</td><td>${s.time.toFixed(2)}</td></tr>`).join('');
}

Array.from(menu.querySelectorAll('button[data-difficulty]')).forEach(btn=>{
  btn.addEventListener('click',()=>{
    difficulty=btn.dataset.difficulty;
    loadLeaderboard();
    startGame(difficulty);
  });
});

exitBtn.addEventListener('click',()=>{endGame();});
menuBtn.addEventListener('click',()=>{showMenu();});
submitScoreBtn.addEventListener('click',submitScore);
topBtn.addEventListener('click',()=>{toggleTopView(true);});
returnTopBtn.addEventListener('click',()=>{toggleTopView(false);});

function showMenu(){
  if(controls) controls.unlock();
  cancelAnimationFrame(animationId);
  clearInterval(timerInterval);
  gameScreen.classList.add('hidden');
  victoryScreen.classList.add('hidden');
  menu.classList.remove('hidden');
  loadLeaderboard();
}

function startGame(diff){
  menu.classList.add('hidden');
  victoryScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  topBtn.classList.add('hidden');
  returnTopBtn.classList.add('hidden');
  topView=false;
  topZones=[];

  mazeSize = diff==='easy'?10: diff==='medium'?20:30;
  maze = generateMaze(mazeSize,mazeSize);
  setupTopZones(diff);

  // Three.js setup
  renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvasContainer.innerHTML='';
  canvasContainer.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background=new THREE.Color(0x000000);
  const ambient=new THREE.AmbientLight(0xffffff,0.5); scene.add(ambient);
  const light=new THREE.DirectionalLight(0xffffff,0.8); light.position.set(1,1,0); scene.add(light);

  camera=new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight,0.1,1000);
  camera.position.set(cellSize/2,1.6,cellSize/2);
  playerPos={x:0,z:0};

  controls=new PointerLockControls(camera, renderer.domElement);
  renderer.domElement.addEventListener('click',()=>controls.lock());
  // Lock pointer immediately after starting so the game is ready to play
  controls.lock();

  buildMaze();
  placeGoal();

  startTimer();
  animate();
}

function endGame(){
  showMenu();
}

function generateMaze(w,h){
  const cells=[]; for(let z=0;z<h;z++){cells[z]=[]; for(let x=0;x<w;x++)cells[z][x]={x,z,visited:false,walls:[true,true,true,true]};}
  const stack=[]; let current=cells[0][0]; current.visited=true;
  const dirs=[[1,0,0],[0,1,1],[-1,0,2],[0,-1,3]]; // dx,dy, opposite
  do{
    const neighbors=dirs.map(([dx,dz,o],i)=>{const nx=current.x+dx,nz=current.z+dz; return cells[nz] && cells[nz][nx] && !cells[nz][nx].visited?{cell:cells[nz][nx],dir:i,opp:o}:null;}).filter(Boolean);
    if(neighbors.length){
      const next=neighbors[Math.floor(Math.random()*neighbors.length)];
      current.walls[next.dir]=false;
      next.cell.walls[next.opp]=false;
      stack.push(current);
      current=next.cell; current.visited=true;
    } else current=stack.pop();
  }while(stack.length);
  return cells;
}

function buildMaze(){
  const wallHeight=3;
  const wallMat=new THREE.MeshPhongMaterial({color:0x4444ff});
  const floorMat=new THREE.MeshPhongMaterial({color:0x222222});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(mazeSize*cellSize, mazeSize*cellSize), floorMat);
  floor.rotation.x=-Math.PI/2;
  scene.add(floor);
  const wallGeom=new THREE.BoxGeometry(cellSize, wallHeight, 0.5);
  for(let z=0;z<mazeSize;z++){
    for(let x=0;x<mazeSize;x++){
      const cell=maze[z][x];
      const baseX=x*cellSize+cellSize/2;
      const baseZ=z*cellSize+cellSize/2;
      if(cell.walls[0]){ // east
        const wall=new THREE.Mesh(wallGeom, wallMat);
        wall.position.set(baseX+cellSize/2, wallHeight/2, baseZ);
        wall.rotation.y=Math.PI/2;
        scene.add(wall);
      }
      if(cell.walls[1]){ // south
        const wall=new THREE.Mesh(wallGeom, wallMat);
        wall.position.set(baseX, wallHeight/2, baseZ+cellSize/2);
        scene.add(wall);
      }
      if(x===0){ // west outer
        const wall=new THREE.Mesh(wallGeom, wallMat);
        wall.position.set(baseX-cellSize/2, wallHeight/2, baseZ);
        wall.rotation.y=Math.PI/2;
        scene.add(wall);
      }
      if(z===0){ // north outer
        const wall=new THREE.Mesh(wallGeom, wallMat);
        wall.position.set(baseX, wallHeight/2, baseZ-cellSize/2);
        scene.add(wall);
      }
    }
  }
}

function placeGoal(){
  const corners=[[0,0],[mazeSize-1,0],[0,mazeSize-1],[mazeSize-1,mazeSize-1]];
  const [gx,gz]=corners[Math.floor(Math.random()*4)];
  const geom=new THREE.SphereGeometry(1,16,16);
  const mat=new THREE.MeshStandardMaterial({color:0xff0000});
  goalMesh=new THREE.Mesh(geom,mat);
  goalMesh.position.set(gx*cellSize+cellSize/2,1,gz*cellSize+cellSize/2);
  scene.add(goalMesh);
}

function setupTopZones(diff){
  if(diff==='easy'){topBtn.classList.remove('hidden');}
  if(diff==='medium'){
    // choose 3 random cells along maze
    for(let i=0;i<3;i++){
      topZones.push({x:Math.floor(Math.random()*mazeSize),z:Math.floor(Math.random()*mazeSize)});
    }
  }
}

function toggleTopView(state){
  if(state){
    topView=true;
    controls.unlock();
    camera.position.set(mazeSize*cellSize/2, mazeSize*cellSize, mazeSize*cellSize/2);
    camera.lookAt(mazeSize*cellSize/2,0,mazeSize*cellSize/2);
    returnTopBtn.classList.remove('hidden');
    topBtn.classList.add('hidden');
  } else {
    topView=false;
    camera.position.set(playerPos.x*cellSize+cellSize/2,1.6,playerPos.z*cellSize+cellSize/2);
    camera.lookAt(camera.position.x,1.6,camera.position.z-1);
    returnTopBtn.classList.add('hidden');
    if(difficulty==='easy') topBtn.classList.remove('hidden');
  }
}

function animate(){
  animationId=requestAnimationFrame(animate);
  const delta=0.05;
  if(!topView){
    const dir=new THREE.Vector3();
    camera.getWorldDirection(dir);
    const moveZ=moveForward*delta;
    const moveX=moveRight*delta;
    const nextX=camera.position.x+dir.x*moveZ+dir.z*moveX;
    const nextZ=camera.position.z+dir.z*moveZ-dir.x*moveX;
    if(!collides(nextX,nextZ)){
      camera.position.x=nextX;
      camera.position.z=nextZ;
      playerPos.x=Math.floor(camera.position.x/cellSize);
      playerPos.z=Math.floor(camera.position.z/cellSize);
      checkGoal();
      if(difficulty==='medium' && inTopZone(playerPos.x,playerPos.z)){
        topBtn.classList.remove('hidden');
      } else if(difficulty==='medium') topBtn.classList.add('hidden');
    }
  }
  renderer.render(scene,camera);
}

function collides(x,z){
  const cx=Math.floor(camera.position.x/cellSize);
  const cz=Math.floor(camera.position.z/cellSize);
  const nx=Math.floor(x/cellSize);
  const nz=Math.floor(z/cellSize);
  if(nx<0||nz<0||nx>=mazeSize||nz>=mazeSize) return true;
  if(cx===nx && cz===nz) return false;
  const cell=maze[cz][cx];
  if(nx>cx && cell.walls[0]) return true; // east
  if(nx<cx && cell.walls[2]) return true; // west
  if(nz>cz && cell.walls[1]) return true; // south
  if(nz<cz && cell.walls[3]) return true; // north
  return false;
}

function checkGoal(){
  const dx=camera.position.x-goalMesh.position.x;
  const dz=camera.position.z-goalMesh.position.z;
  if(Math.sqrt(dx*dx+dz*dz)<1){
    win();
  }
}

function win(){
  clearInterval(timerInterval);
  finalTimeEl.textContent=timerEl.textContent;
  gameScreen.classList.add('hidden');
  victoryScreen.classList.remove('hidden');
}

function startTimer(){
  startTime=Date.now();
  timerInterval=setInterval(()=>{
    const t=(Date.now()-startTime)/1000;
    const m=Math.floor(t/60).toString().padStart(2,'0');
    const s=(t%60).toFixed(0).padStart(2,'0');
    timerEl.textContent=`${m}:${s}`;
  },1000);
}

function submitScore(){
  const name=playerNameInput.value.trim(); if(!name) return;
  const data=JSON.parse(localStorage.getItem('mazeScores')||'{}');
  const t=parseFloat(timerEl.textContent.split(':')[0])*60+parseFloat(timerEl.textContent.split(':')[1]);
  const arr=data[difficulty]||[]; arr.push({name,time:t}); arr.sort((a,b)=>a.time-b.time); if(arr.length>10)arr.length=10; data[difficulty]=arr;
  localStorage.setItem('mazeScores',JSON.stringify(data));
  playerNameInput.value='';
  showMenu();
}

// Keyboard controls
window.addEventListener('keydown',e=>{
  if(e.code==='KeyW'||e.code==='ArrowUp') moveForward=1;
  if(e.code==='KeyS'||e.code==='ArrowDown') moveForward=-1;
  if(e.code==='KeyA'||e.code==='ArrowLeft') moveRight=-1;
  if(e.code==='KeyD'||e.code==='ArrowRight') moveRight=1;
});
window.addEventListener('keyup',e=>{
  if(['KeyW','ArrowUp','KeyS','ArrowDown'].includes(e.code)) moveForward=0;
  if(['KeyA','ArrowLeft','KeyD','ArrowRight'].includes(e.code)) moveRight=0;
});

// Touch controls
function handleTouchStart(e,isLeft){
  if(e.touches.length>0){const t=e.touches[0]; (isLeft?leftTouchStart:rightTouchStart)={x:t.clientX,y:t.clientY};}
}
function handleTouchMove(e,isLeft){
  if(!leftTouchStart && isLeft) return; if(!rightTouchStart && !isLeft) return;
  const t=e.touches[0]; const start=isLeft?leftTouchStart:rightTouchStart;
  const dx=t.clientX-start.x; const dy=t.clientY-start.y;
  if(isLeft){ moveForward = -dy/50; moveRight=dx/50; }
  else { camera.rotation.y -= dx/200; }
}
function handleTouchEnd(e,isLeft){
  if(isLeft){moveForward=0; moveRight=0; leftTouchStart=null;}
  else {rightTouchStart=null;}
}
touchLeft.addEventListener('touchstart',e=>handleTouchStart(e,true));
touchLeft.addEventListener('touchmove',e=>handleTouchMove(e,true));
touchLeft.addEventListener('touchend',e=>handleTouchEnd(e,true));
touchRight.addEventListener('touchstart',e=>handleTouchStart(e,false));
touchRight.addEventListener('touchmove',e=>handleTouchMove(e,false));
touchRight.addEventListener('touchend',e=>handleTouchEnd(e,false));

function inTopZone(x,z){
  return topZones.some(c=>c.x===x && c.z===z);
}

window.addEventListener('resize',()=>{
  if(renderer && camera){
    camera.aspect=window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
  }
});

loadLeaderboard();
