        .ai-estimate-field-active::before {
          opacity: 1;
          animation: ai-estimate-spin 1.25s linear infinite;
        }

        .ai-estimate-field-inner {
          position: relative;
          z-index: 1;
          border-radius: 0.875rem;
          background: hsl(162,10%,8%);
          overflow: hidden;
        }
      `}</style>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-teal-300" />
          <p className="text-sm font-bold uppercase tracking-widest text-white/40">
            Estimate a meal
          </p>
        </div>

        <div
          className={`ai-estimate-field ${
            isEstimatingMeal ? "ai-estimate-field-active" : ""
          }`}
        >
          <div className="ai-estimate-field-inner">
            <Textarea
              value={mealText}
              onChange={(event) => setMealText(event.target.value)}
              placeholder="e.g. 2 slices pepperoni pizza and a 12 oz coke"
              rows={4}
              className={`resize-none rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-white/30 ${
                isEstimatingMeal ? "border-transparent bg-white/5" : ""
              }`}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleEstimateMeal}
          disabled={!mealText.trim() || isEstimatingMeal}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 py-3 text-sm font-semibold text-white transition hover:bg-teal-400 disabled:opacity-40"
        >
          {isEstimatingMeal ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Estimating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Estimate meal
            </>
          )}
        </button>
      </div>

      {estimatedMeal ? (
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-white/40">
            Review estimate
          </p>

          <label>
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">
              Meal name
            </span>
            <input
              value={estimatedMeal.mealName}
              onChange={(event) => updateEstimatedMeal({ mealName: event.target.value })}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold text-white outline-none focus:border-teal-400"
            />
          </label>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ["carbs", "Carbs", "g"],
              ["protein", "Protein", "g"],
              ["fat", "Fat", "g"],
              ["calories", "Calories", ""],
              ["gi", "GI", ""],
            ].map(([key, label, unit]) => (
              <label key={key} className={key === "gi" ? "col-span-2" : ""}>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">
                  {label}
                </span>
                <div className="flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={estimatedMeal[key]}
                    onChange={(event) =>
                      updateEstimatedMeal({ [key]: event.target.value })
                    }
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
                  />
                  {unit && <span className="text-xs text-white/35">{unit}</span>}
                </div>
              </label>
            ))}
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">
              Absorption
            </span>
            <select
              value={estimatedMeal.absorptionProfile}
              onChange={(event) =>
                updateEstimatedMeal({ absorptionProfile: event.target.value })
              }
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-teal-400"
            >
              <option value="fast" className="bg-[#18211f]">
                Fast
              </option>
              <option value="medium" className="bg-[#18211f]">
                Medium
              </option>
              <option value="slow" className="bg-[#18211f]">
                Slow
              </option>
            </select>
          </label>

          {estimatedMeal.assumptions?.length > 0 && (
            <div className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                Assumptions
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/45">
                {estimatedMeal.assumptions.join("; ")}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 flex min-h-[180px] flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 text-center">
          <p className="text-sm leading-relaxed text-white/35">
            Enter a meal description above to estimate carbs, GI, calories, protein, fat, and absorption speed.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmitEstimate}
        disabled={!estimatedMeal || isPending}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 py-4 text-base font-semibold text-white transition hover:bg-orange-500 disabled:opacity-40"
      >
        <Check className="h-4 w-4" />
        {isPending ? "Logging..." : "Log meal estimate"}
      </button>
    </div>
  );
}