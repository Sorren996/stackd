// Mirror of the server's pure opening guard; parity is covered by tests.
export const MOMENTUM_TAU = 12;
export const MAX_RATE = 4.5;
export const clampRate = rate => Math.max(-MAX_RATE, Math.min(MAX_RATE, rate));
export function projectionOpening({ readings, anchorTime, velocity, activeUnits, insulinRate, mechanism, previous }) {
  const recent = readings.filter(r => r.time <= anchorTime && r.time >= anchorTime - 15 * 60000 && r.source !== 'manual' && r.source !== 'system');
  const last = recent.slice(-3);
  const signs = last.slice(1).map((r,i) => Math.sign(r.value-last[i].value));
  const confirmedSign = signs.length === 2 && signs[0] === signs[1] ? signs[0] : null;
  const priorSign = previous?.acceptedSign ?? Math.sign(previous?.measuredVelocity || 0);
  let measured = velocity ?? 0;
  const heldSign = priorSign !== 0 && Math.sign(measured) !== 0 && Math.sign(measured) !== priorSign && confirmedSign !== Math.sign(measured);
  if (heldSign) measured = 0;
  const budgetCap = 20 / MOMENTUM_TAU;
  const cap = activeUnits > 3 ? Math.min(budgetCap, insulinRate * 0.35) : budgetCap;
  let momentum = Math.max(-cap, Math.min(cap, Math.max(-3, Math.min(3, measured))));
  const damped = activeUnits === 0 && mechanism === 0 && measured <= -1.5;
  if (damped) momentum *= 0.35;
  const rawOpening = clampRate(mechanism + momentum);
  const priorRate = previous?.openingRate;
  const stableOpening = Number.isFinite(priorRate) ? Math.max(priorRate-0.8, Math.min(priorRate+0.8,rawOpening)) : rawOpening;
  const stabilityOffset = clampRate(stableOpening) - rawOpening;
  return { momentum, damped, cap, heldSign, confirmedSign, acceptedSign: heldSign ? priorSign : Math.sign(measured), stabilityOffset,
    openingRate: clampRate(rawOpening+stabilityOffset), activeUnits,
    displacementLimit: 20, stabilityLimited: Math.abs(stabilityOffset)>0.000001 };
}