// Wording for the three prescribed-insulin settings, shared by the sign-up
// step and Settings so one number is explained one way in both places.
//
// Units describe the stored fields exactly as they are calculated:
//   · insulin_sensitivity_mgdl_per_unit → mg/dL per UNIT
//   · meal_insulin_units_per_5g         → UNITS per 5 GRAMS of carbs
//     (not grams per unit — nothing here inverts or converts it)
//   · correction_target_glucose         → mg/dL
//
// Copy is plain and factual: it explains what a number is used for, never what
// anyone's number should be.

export const DOSE_TERMS = {
  sensitivity: {
    label: 'Insulin Sensitivity Factor',
    medical: 'Insulin sensitivity',
    unit: 'mg/dL per unit',
    helper: 'How much one unit is expected to lower glucose.',
    short:
      'This is how much one unit of insulin is expected to lower your glucose, according to the plan from your care team.',
    more:
      'Stackd uses it for meal and correction insulin estimates. Long-acting (basal) insulin is not part of that calculation.',
  },
  mealRatio: {
    label: 'Insulin to Carb Ratio',
    medical: 'Carb ratio',
    unit: 'units per 5 grams of carbs',
    helper: 'Units of insulin for 5 grams of carbs',
    short:
      'This is how many units of insulin your plan pairs with 5 grams of carbohydrate.',
    more:
      'Stackd keeps your number on exactly this 5-gram basis. It does not convert it to grams per unit.',
  },
  // The calculation it belongs to, checked in ActiveInsulinBanner:
  //   correction units = (current glucose − target) / glucose drop per unit,
  //   and that estimate is only made at all when the reading is above the
  //   comfort zone's upper bound. So this number is the level the estimate aims
  //   TOWARD — it is not a threshold that triggers anything, and changing it
  //   never changes an alert, a comfort-zone band or a notification.
  correctionTarget: {
    label: 'Correction Target',
    medical: 'Correction target',
    unit: 'mg/dL',
    helper: 'The target glucose level used in correction calculations.',
    short:
      'This is the target your plan uses when Stackd estimates a correction. It is the level the estimate aims toward, not a level that starts an alert.',
    more:
      'It does not change your alert thresholds or your comfort-zone range — those are set separately.',
  },
};