// Pure, deterministic residual calibration. Sign is ACTUAL minus PREDICTED.
// No median-model changes and no fitted-width constants.
export const RESIDUAL_HORIZONS = [15, 30, 45, 60, 90, 120];
export const BAND_VERSION = '2.0.0-residual-quantiles';
const DAY = 86400000;
export const roundBand = n => Math.round(n * 100) / 100;
export function weightedQuantile(rows, q, now) {
  if (!rows.length) return null;
  const sorted = rows.map(r => ({ value: r.residual, weight: Math.pow(0.5, Math.max(0, now - Date.parse(r.generated_at)) / (14 * DAY)) })).sort((a,b) => a.value - b.value);
  // Weighted mid-CDF interpolation; equals ordinary interpolated quantiles for equal weights.
  const total = sorted.reduce((s,r) => s + r.weight, 0);
  let cumulative = 0;
  const cdf = sorted.map(r => { const p = (cumulative + r.weight / 2) / total; cumulative += r.weight; return p; });
  const target = cdf[0] + q * (cdf.at(-1) - cdf[0]);
  for (let i = 1; i < sorted.length; i++) if (target <= cdf[i]) {
    const t = (target - cdf[i-1]) / (cdf[i] - cdf[i-1] || 1);
    return sorted[i-1].value + t * (sorted[i].value - sorted[i-1].value);
  }
  return sorted.at(-1).value;
}
export function flattenResiduals(records, now = Date.now()) {
  const unique = new Map();
  for (const p of records) for (const s of p.scores || []) {
    if (s.excluded || !Number.isFinite(s.residual) || Date.parse(s.actual_at) > now) continue;
    const key = `${p.projection_id}:${s.horizon}`;
    const row = { ...s, generated_at: p.generated_at, projection_id: p.projection_id, volatility_sd: p.volatility_sd, context: p.context, model_version: p.model_version };
    if (!unique.has(key) || Date.parse(s.scored_at) > Date.parse(unique.get(key).scored_at)) unique.set(key, row);
  }
  return [...unique.values()];
}
const plainQuantile = (values, q) => weightedQuantile(values.map(residual => ({ residual, generated_at: '2000-01-01T00:00:00Z' })), q, Date.parse('2000-01-01T00:00:00Z'));
export function coverageGuard(rows, previous = {}, referenceForRow = null) {
  const last = rows.filter(r => typeof r.covered === 'boolean').sort((a,b) => Date.parse(b.actual_at) - Date.parse(a.actual_at) || Date.parse(b.generated_at) - Date.parse(a.generated_at) || a.horizon - b.horizon || a.projection_id.localeCompare(b.projection_id)).slice(0,50);
  const coverage = last.length ? last.filter(r => r.covered).length / last.length : null;
  const key = (referenceForRow ? 'candidate_intervals:' : '') + last.map(r => `${r.projection_id}:${r.horizon}:${r.residual}:${r.covered}`).join('|');
  // Old-scale values were relative to legacy shown widths, not candidate widths.
  const sameReference = !referenceForRow || String(previous.coverage_key || '').startsWith('candidate_intervals:');
  let scale = sameReference ? Number(previous.coverage_scale) || 1 : 1;
  let action = 'hold';
  // Coverage always measures the band actually shown. Scaling is expressed
  // against the candidate percentile interval, not a legacy band's width:
  // otherwise replacing a wide old band AND applying its shrink ratio would
  // tighten twice and immediately under-cover.
  const ratios = last.map(r => ({ ...r, ...(referenceForRow?.(r) || {}) }))
    .filter(r => Number.isFinite(r.base_lower) && Number.isFinite(r.base_upper) && r.base_upper > r.base_lower)
    .map(r => Math.abs(r.residual - (r.base_lower+r.base_upper)/2) / ((r.base_upper-r.base_lower)/2));
  const measuredScale = ratios.length ? plainQuantile(ratios,0.8) : null;
  if (last.length === 50 && key !== previous.coverage_key && measuredScale != null) {
    if (coverage < 0.72) { scale = Math.max(scale, measuredScale); action = 'widen'; }
    else if (coverage > 0.90) { scale = Math.max(0.01, Math.min(scale, measuredScale)); action = 'tighten'; }
  }
  return { scale, coverage, count: last.length, key, action, measuredScale, target: 0.8, triggerLow: 0.72, triggerHigh: 0.90 };
}
function shadowBias(rows, now) {
  const ordered = [...rows].sort((a,b) => Date.parse(a.generated_at)-Date.parse(b.generated_at));
  let baseline = 0, corrected = 0, count = 0;
  for (const r of ordered.slice(-50)) {
    const known = ordered.filter(t => Date.parse(t.actual_at) < Date.parse(r.generated_at));
    if (known.length < 30) continue;
    const correction = weightedQuantile(known,0.5,Date.parse(r.generated_at));
    baseline += Math.abs(r.residual); corrected += Math.abs(r.residual-correction); count++;
  }
  return { medianResidual: weightedQuantile(rows,0.5,now), applied: false, validationCount: count,
    baselineMae: count ? roundBand(baseline/count) : null, correctedMae: count ? roundBand(corrected/count) : null,
    evidenceImproves: count >= 30 && corrected < baseline, mode: 'shadow_only' };
}
export function fitResidualBand(rows, volatilitySd, defaultTrajectory, previous, now = Date.now()) {
  const referenceIntervals = {};
  const volatilityRows = rows.filter(r => Number.isFinite(r.volatility_sd)).map(r => ({ ...r, residual: r.volatility_sd }));
  const threshold = weightedQuantile(volatilityRows,0.5,now);
  const byHorizon = {};
  for (const h of RESIDUAL_HORIZONS) {
    const all = rows.filter(r => r.horizon === h);
    const calm = all.filter(r => Number.isFinite(r.volatility_sd) && r.volatility_sd <= threshold);
    const volatile = all.filter(r => Number.isFinite(r.volatility_sd) && r.volatility_sd > threshold);
    const split = threshold != null && calm.length >= 30 && volatile.length >= 30 && Number.isFinite(volatilitySd);
    const selected = split ? (volatilitySd <= threshold ? calm : volatile) : all;
    const n = selected.length, blend = n < 30 ? n/(n+30) : 1;
    const fallback = defaultTrajectory.find(p => p.min_offset === h) || defaultTrajectory.at(-1);
    const fallbackLow = fallback ? fallback.lower - fallback.value : 0;
    const fallbackHigh = fallback ? fallback.upper - fallback.value : 0;
    const q10 = weightedQuantile(selected,0.1,now), q90 = weightedQuantile(selected,0.9,now);
    const low = n ? blend*q10+(1-blend)*fallbackLow : fallbackLow;
    const high = n ? blend*q90+(1-blend)*fallbackHigh : fallbackHigh;
    const reference = selectedRows => {
      const count = selectedRows.length, weight = count < 30 ? count/(count+30) : 1;
      const lower = count ? weight*weightedQuantile(selectedRows,0.1,now)+(1-weight)*fallbackLow : fallbackLow;
      const upper = count ? weight*weightedQuantile(selectedRows,0.9,now)+(1-weight)*fallbackHigh : fallbackHigh;
      const centre = (lower+upper)/2, half = Math.max(8,(upper-lower)/2);
      return {base_lower:centre-half,base_upper:centre+half};
    };
    referenceIntervals[h] = {pooled:reference(all),calm:reference(calm),volatile:reference(volatile),split};
    byHorizon[h] = { sampleCount: all.length, fitSampleCount:n, q10, q90, medianResidual:weightedQuantile(selected,0.5,now),
      mae: all.length ? roundBand(all.reduce((s,r)=>s+Math.abs(r.residual),0)/all.length) : null,
      bucket: split ? (volatilitySd <= threshold ? 'calm':'volatile') : 'pooled', calmCount:calm.length, volatileCount:volatile.length,
      personalWeight:blend, defaultBlend:blend < 1, baseLower:low, baseUpper:high, shadowBias:shadowBias(selected,now) };
  }
  const guard = coverageGuard(rows,previous,r => {
    const refs = referenceIntervals[r.horizon];
    if (!refs) return null;
    const bucket = refs.split && Number.isFinite(r.volatility_sd) ? (r.volatility_sd <= threshold ? 'calm' : 'volatile') : 'pooled';
    return refs[bucket];
  });
  return { byHorizon, guard, volatilityThreshold:threshold, sampleCount:rows.length, now };
}
function interpolateFit(fit, h) {
  const knots = [0,...RESIDUAL_HORIZONS];
  let b = knots.find(x => x >= h) ?? 120;
  let a = knots[Math.max(0,knots.indexOf(b)-1)];
  if (h >= 120) a = b = 120;
  const t = a === b ? 1 : (h-a)/(b-a);
  const left = a ? fit.byHorizon[a] : { baseLower:0,baseUpper:0 };
  const right = fit.byHorizon[b];
  return { low:left.baseLower+(right.baseLower-left.baseLower)*t, high:left.baseUpper+(right.baseUpper-left.baseUpper)*t };
}
export function applyResidualBand(trajectory, fit) {
  let carried = 0;
  const audit = [];
  const full = trajectory.map(p => {
    if (p.min_offset === 0) return { ...p, lower:p.value,upper:p.value };
    const {low,high} = interpolateFit(fit,p.min_offset);
    const centre = (low+high)/2, rawHalf = Math.max(0,(high-low)/2);
    const floor = p.min_offset > 10 ? 8 : 0;
    const baseHalf = Math.max(floor,rawHalf);
    carried = Math.min(75,Math.max(carried,floor,rawHalf*fit.guard.scale));
    audit.push({ horizon:p.min_offset, baseLower:centre-baseHalf,baseUpper:centre+baseHalf, halfWidth:roundBand(carried), lowerOffset:roundBand(centre-carried),upperOffset:roundBand(centre+carried) });
    return { ...p, lower:roundBand(p.value+centre-carried),upper:roundBand(p.value+centre+carried) };
  });
  const lastUsable = full.filter(p => (p.upper-p.lower)/2 <= 45).at(-1)?.min_offset || 0;
  const end = Math.min(full.at(-1)?.min_offset || 0,Math.max(30,lastUsable));
  return { trajectory:full.filter(p=>p.min_offset <= end), fullTrajectory:full, summary:{
    method:'recency_weighted_residual_quantiles',version:BAND_VERSION,residualSign:'actual_minus_predicted',
    percentiles:[0.1,0.9],nominalCoverage:0.8,halfLifeDays:14,sampleCount:fit.sampleCount,horizons:fit.byHorizon,
    coverage:fit.guard.coverage,coverageSampleCount:fit.guard.count,coverageScale:fit.guard.scale,coverageAction:fit.guard.action,
    measuredCoverageScale:fit.guard.measuredScale,coverageWindow:50,defaultBlend: Object.values(fit.byHorizon).some(v=>v.defaultBlend),
    volatilityThreshold:fit.volatilityThreshold,volatilitySplitRule:'per_horizon_both_buckets_at_least_30',
    halfWidthFloor:8,floorAfterMinutes:10,halfWidthCap:75,truncateHalfWidth:45,minimumDrawMinutes:30,
    trajectoryEndsAtMinutes:end,untruncatedHorizonMinutes:full.at(-1)?.min_offset || 0,bandAudit:audit,
    shadowForecastPoints:full.filter(p=>p.min_offset>end && RESIDUAL_HORIZONS.includes(p.min_offset)),
    calibrationAt:new Date(fit.now).toISOString(),biasMode:'shadow_only'
  }};
}