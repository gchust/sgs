import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../../lib/game/engine.js';
import {HEROES} from '../../lib/game/data.js';

test('seven seats have balanced identities and unique generals',()=>{
 const game=new Game('guanyu','normal',{},7);
 assert.equal(game.players.length,7);
 assert.deepEqual(game.players.map(p=>p.role).sort(),['lord','loyalist','loyalist','rebel','rebel','rebel','spy'].sort());
 assert.equal(new Set(game.players.map(p=>p.hero.id)).size,7);
 assert.equal(game.players[0].max,5);
});
test('circular distance respects death, horses and weapon reach',()=>{
 const g=new Game('guanyu','normal',{},7),p=g.players;
 assert.deepEqual(p.map(t=>g.dist(p[0],t)),[0,1,2,3,3,2,1]);
 p[1].alive=false;assert.equal(g.dist(p[0],p[2]),1);
 p[2].equip.horse={type:'dilu'};assert.equal(g.dist(p[0],p[2]),2);
 p[0].equip.offhorse={type:'chitu'};assert.equal(g.dist(p[0],p[2]),1);
 p[0].used.sha=0;assert.equal(g.valid(p[0],{type:'sha'},p[4]),'目标超出攻击范围');
 p[0].equip.weapon={type:'qinglong'};assert.equal(g.valid(p[0],{type:'sha'},p[4]),null);
});
test('victory preserves surviving loyalists and recognises lone spy',()=>{
 const g=new Game('guanyu','normal',{},7);
 g.players.filter(p=>['rebel','spy'].includes(p.role)).forEach(p=>p.alive=false);
 assert.equal(g.check(),'win');assert.equal(g.winner,'lord');
 const h=new Game('guanyu','normal',{},7);h.players.filter(p=>p.role!=='spy').forEach(p=>p.alive=false);
 assert.equal(h.check(),'lose');assert.equal(h.winner,'spy');
});
test('lord killing loyalist loses hand and equipment, rebel kill earns three',async()=>{
 const g=new Game('guanyu','normal',{},7),lord=g.players[0],loyal=g.players.find(p=>p.role==='loyalist');
 for(const p of g.players)p.hand=[];lord.equip.weapon={id:999,type:'qinggang'};loyal.hp=0;
 await g.dying(loyal,lord);assert.equal(lord.hand.length,0);assert.deepEqual(lord.equip,{});
 const rebel=g.players.find(p=>p.role==='rebel');rebel.hp=0;await g.dying(rebel,lord);assert.equal(lord.hand.length,3);
});
test('cancellation interrupts a pending human response',async()=>{
 let resolve;const g=new Game('guanyu','normal',{ask:()=>new Promise(r=>resolve=r)},7);
 const pending=g.ask(g.players[0],'响应',[{value:1,label:'测试'}]);g.cancelled=true;resolve(1);
 await assert.rejects(pending,/cancelled/);
});
test('all 39 generals complete 2, 5 and 7-player games without duplicate physical cards',async()=>{
 let seed=73029;const original=Math.random;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 try{for(const n of [2,5,7])for(const hero of HEROES){
  const g=new Game(hero.id,'normal',{},n);
  for(let round=1;round<=180&&!g.over;round++){
   g.round=round;
   for(const p of g.players){if(!p.alive||g.over)continue;if(await g.begin(p.id))await g.ai(p.id);await g.finish(p.id);
    const ids=[...g.pile,...g.discard,...g.players.flatMap(p=>[...p.hand,...Object.values(p.equip),...p.delays,...p.scars])].map(c=>c.id);
    assert.equal(new Set(ids).size,ids.length,`${hero.name}/${n}人，第${round}轮出现实体卡牌重复`);
    assert(g.players.every(p=>p.hp<=p.max));
   }
  }
  assert(g.over,`${hero.name}/${n}人对局180轮后未结束`);
 }}finally{Math.random=original}
});
