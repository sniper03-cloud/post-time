const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const slice = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const src = slice('    const validateAnalysis =', '    // Storage helpers — race card cache') + slice('    const parseOdds =', '    // v7.1: Nav state') + slice('    const getOddsFreshness =', '    // Parse odds') + slice('      const computeOverlays =', '      const prettyDate =');
const ctx = vm.createContext({Date});
vm.runInContext(src + '\nthis.api = {parseOdds, validateAnalysis, computeOverlays};', ctx);
const {parseOdds,validateAnalysis,computeOverlays} = ctx.api;
assert.equal(parseOdds('5/2'), 2.5); assert.equal(parseOdds('1-2'), 0.5);
for(const bad of ['2 garbage','Infinity','-1','1/0','SCR','']) assert.equal(parseOdds(bad),null);
const field = [{postPosition:'1',name:'Alpha'},{postPosition:'2',name:'Beta'}];
const sample = () => ({fieldProbabilities:field.map((h,i)=>({...h,winProbability:i?0.8:0.2})),topPicks:Object.fromEntries(['win','place','show','longshot'].map(k=>[k,field[0]])),runnerAssessments:field.map(h=>({...h,strengths:'Evidence',concerns:'Risk',verdict:'Contender'})),exotics:{},summary:'Fixture'});
validateAnalysis(sample(),field);
for(const mutate of [d=>d.fieldProbabilities.pop(),d=>d.fieldProbabilities[0].winProbability=NaN,d=>d.fieldProbabilities[0].winProbability=1.1,d=>d.fieldProbabilities[0].name='Wrong',d=>d.fieldProbabilities[1]={...d.fieldProbabilities[0]},d=>d.topPicks.win= {postPosition:'9',name:'Scratched'}]) {const d=sample();mutate(d);assert.throws(()=>validateAnalysis(d,field));}
const odds={capturedAt:Date.now(),horses:[{postPosition:'1',liveOdds:'3-1'},{postPosition:'2',liveOdds:'1-4'}]};
let value=computeOverlays(sample(),odds).rows.find(h=>h.postPosition==='1');
assert.ok(Math.abs(value.expectedReturn-(-.2))<1e-9); // 20% at 3:1 loses 20%, regardless of overround.
assert.equal(value.toteProb,.25);
const positive=sample();positive.fieldProbabilities[0].winProbability=.4;positive.fieldProbabilities[1].winProbability=.6;
assert.ok(computeOverlays(positive,odds).overlays.length>0);
assert.equal(computeOverlays({...positive,assessment:'PASS'},odds).overlays.length,0);
assert.equal(computeOverlays(positive,{...odds,capturedAt:Date.now()-31*60000}).overlays.length,0);
console.log('Analysis validation, malformed odds, payout EV, PASS and stale-odds checks passed.');

assert.equal(computeOverlays(positive,{...odds,horses:[...odds.horses,{postPosition:'1',liveOdds:'8-1'}]}).rows.find(h=>h.postPosition==='1').toteProb,null);
assert.equal(computeOverlays(positive,{...odds,horses:[{postPosition:'1',name:'Wrong horse',liveOdds:'8-1'}]}).rows.find(h=>h.postPosition==='1').toteProb,null);
