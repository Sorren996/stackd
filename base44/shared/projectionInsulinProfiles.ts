// Server mirror of the bolus entries in src/lib/insulinPharmacology.js.
// A parity test keeps these registry timings aligned. No dose-size shifts.
const profiles = {
  aspart: { onset: 15, peak: 75, duration: 300 },
  lispro: { onset: 15, peak: 60, duration: 300 },
  glulisine: { onset: 12, peak: 55, duration: 300 },
  faster_aspart: { onset: 4, peak: 45, duration: 300 },
  lispro_aabc: { onset: 4, peak: 45, duration: 300 },
  inhaled: { onset: 2, peak: 18, duration: 180 },
  regular: { onset: 30, peak: 150, duration: 480 },
  concentrated_regular: { onset: 30, peak: 240, duration: 960 },
};
export default function projectionInsulinProfile(type) {
  const lower = String(type || '').toLowerCase();
  const family = /u-?500/.test(lower) ? 'concentrated_regular'
    : /afrezza|inhaled/.test(lower) ? 'inhaled'
    : /fiasp|faster/.test(lower) ? 'faster_aspart'
    : /lyumjev|aabc/.test(lower) ? 'lispro_aabc'
    : /apidra|glulisine/.test(lower) ? 'glulisine'
    : /lispro|humalog|admelog/.test(lower) ? 'lispro'
    : /regular|humulin r|novolin r/.test(lower) ? 'regular' : 'aspart';
  return { family, ...profiles[family] };
}