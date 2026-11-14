import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitResidualBand,applyResidualBand,coverageGuard,weightedQuantile,flattenResiduals} from '../residualBandMath.ts';
import {scoreStoredProjection} from '../projectionResidualScoring.ts';
const now=Date.parse('2026-11-14T07:00:00Z'),iso=t=>new Date(t).toISOString(),M=60000;
const defaultLine=Array.from({length:25},(_,i)=>({min_offset:i*5,time:now+i*5*M,value:130,lower:130-i*2.5,upper:130+i*2.5}));
const sample=(h,r,i=0,v=0.4)=>({horizon:h,residual:r,generated_at:iso(now-3*60*M-i*M),actual_at:iso(now-60*M-i*M),volatility_sd:v,projection_id:`p${i}`,covered:true,base_lower:-30,base_upper:30});
test('signed weighted residual quantiles retain asymmetry and decay over fourteen days',()=>{
 const rows=[{residual:-10,generated_at:iso(now-14*86400000)},{residual:30,generated_at:iso(now)}];
 assert.ok(Math.abs(weightedQuantile(rows,.5,now)-10)<1e-9);
 const r=Array.from({length:60},(_,i)=>sample(30,i<30?-2:18,i));
 const f=fitResidualBand(r,.4,defaultLine,{},now);
 assert.equal(f.byHorizon[30].personalWeight,1);
 assert.equal(f.byHorizon[30].q10,-2);assert.equal(f.byHorizon[30].q90,18);
});
test('sparse horizons blend, mature horizons do not, floor/cap and monotone widths hold without altering median',()=>{
 const rows=[15,30,45,60,90,120].flatMap(h=>Array.from({length:h===15?15:40},(_,i)=>sample(h,i%2?-10:6,i)));
 const fit=fitResidualBand(rows,.4,defaultLine,{},now),b=applyResidualBand(defaultLine,fit);
 assert.equal(fit.byHorizon[15].personalWeight,15/45);assert.equal(fit.byHorizon[30].personalWeight,1);
 let width=0;
 for(const p of b.fullTrajectory){assert.equal(p.value,130);const w=(p.upper-p.lower)/2;assert.ok(w+0.02>=width);assert.ok(w<=75.01);if(p.min_offset>10)assert.ok(w>=7.99);width=w;}
 assert.ok(Object.values(fit.byHorizon).every(h=>h.shadowBias.applied===false));
});
test('calm/volatile split needs thirty observations in BOTH buckets',()=>{
 const rows=Array.from({length:60},(_,i)=>sample(30,i%2?(i<30?5:40):(i<30?-5:-40),i,i<30?.3:3));
 const f=fitResidualBand(rows,.3,defaultLine,{},now);assert.equal(f.byHorizon[30].bucket,'calm');assert.equal(f.byHorizon[30].fitSampleCount,30);
 assert.equal(fitResidualBand(rows.slice(1),.3,defaultLine,{},now).byHorizon[30].bucket,'pooled');
});
test('coverage guard widens and tightens from errors measured against the band shown, idempotently',()=>{
 const under=Array.from({length:50},(_,i)=>({...sample(30,i<40?50:0,i),covered:i>=40,base_lower:-10,base_upper:10}));
 const wide=coverageGuard(under,{});assert.ok(wide.scale>1);assert.equal(wide.coverage,.2);
 assert.equal(coverageGuard(under,{coverage_scale:wide.scale,coverage_key:wide.key}).scale,wide.scale);
 const over=Array.from({length:50},(_,i)=>({...sample(30,i%2?-4:4,i),covered:true,base_lower:-20,base_upper:20}));
 assert.ok(coverageGuard(over,{}).scale<1);
});
test('legacy over-coverage does not shrink newly fitted percentiles twice',()=>{
 const rows=[15,30,45,60,90,120].flatMap(h=>Array.from({length:60},(_,i)=>({...sample(h,i%2?-20:20,i),base_lower:-80,base_upper:80,covered:true})));
 const fit=fitResidualBand(rows,.4,defaultLine,{},now);
 assert.ok(fit.guard.scale>=.99);
 const point=applyResidualBand(defaultLine,fit).fullTrajectory.find(p=>p.min_offset===30);
 assert.ok((point.upper-point.lower)/2>=19.99);
});
test('truncate at last useful five-minute point, retaining at least thirty minutes',()=>{
 const rows=[15,30,45,60,90,120].flatMap(h=>Array.from({length:40},(_,i)=>sample(h,i%2?h:-h,i)));
 const b=applyResidualBand(defaultLine,fitResidualBand(rows,.4,defaultLine,{},now));
 assert.equal(b.trajectory.at(-1).min_offset,45);assert.equal(b.summary.shadowForecastPoints.at(-1).min_offset,120);
});
const generated=now-180*M,anchor=generated-M;
const p={id:'p',user_id:'owner',generated_at:iso(generated),anchor_time:iso(anchor),trajectory:[{time:iso(anchor+30*M),min_offset:30,value:100,lower:90,upper:110}],input_snapshot:{meals:[],doses:[]},data_quality:{volatilitySd:.4,activeDoseCount:1}};
const reading={id:'r',recorded_at:iso(anchor+32*M),value:108,source:'dexcom'};
test('score point timestamp, not generation timestamp; tolerance exactly 2.5min; residual actual-predicted',()=>{
 const s=scoreStoredProjection(p,[reading],[],[],[],now).scores[0];assert.equal(s.residual,8);assert.equal(s.covered,true);assert.equal(s.horizon,30);
 assert.equal(scoreStoredProjection(p,[{...reading,recorded_at:iso(anchor+32.51*M)}],[],[],[],now).scores.length,0);
 assert.equal(scoreStoredProjection(p,[{...reading,source:'system'}],[],[],[],now).scores.length,0);
});
test('new dose, new rescue carbs, edits and deletes exclude affected horizon, not earlier ones',()=>{
 const dose={created_date:iso(generated+10*M),administered_at:iso(generated+10*M),units:2};
 assert.equal(scoreStoredProjection(p,[reading],[],[dose],[],now).scores.length,0);
 const meal={created_date:iso(generated+5*M),consumed_at:iso(generated+5*M),carbs:10,is_rescue_carb:true};
 assert.equal(scoreStoredProjection(p,[reading],[meal],[],[],now).scores.length,0);
 assert.equal(scoreStoredProjection(p,[reading],[],[],[{changed_at:iso(generated+20*M)}],now).scores.length,0);
 assert.equal(scoreStoredProjection(p,[reading],[],[],[{changed_at:iso(generated+50*M)}],now).scores.length,1);
});
test('normalized defaults are not mistaken for a historical input edit',()=>{
 const meal={id:'m',consumed_at:iso(generated-30*M),created_date:iso(generated-40*M),carbs:20,absorption_profile:null};
 const saved={...meal,absorption_profile:'medium',carbs:20};
 const projected={...p,input_snapshot:{meals:[saved],doses:[]}};
 assert.equal(scoreStoredProjection(projected,[reading],[meal],[],[],now).scores.length,1);
 assert.equal(scoreStoredProjection(projected,[reading],[{...meal,carbs:40}],[],[],now).scores.length,0);
});
test('duplicate scoring cannot double count a projection/horizon',()=>{
 const record=scoreStoredProjection(p,[reading],[],[],[],now);assert.equal(flattenResiduals([record,record],now).length,1);
});