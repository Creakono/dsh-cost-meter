window.__ModuleLoader__.load({
	id: "dsh-cost-meter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let react_dom = require("react-dom");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/pricing.ts
		/** Currency display symbols used by the browser half. */
		const CURRENCY_SYMBOLS = {
			CNY: "¥",
			USD: "$"
		};
		/**
		* Weekdays a peak window applies to by default: Monday–Friday. This is the
		* official DeepSeek peak schedule (工作日 09:00–12:00 / 14:00–18:00), and it is
		* also what every window written before weekday selection existed resolves to.
		*/
		const DEFAULT_PEAK_DAYS = [
			1,
			2,
			3,
			4,
			5
		];
		/** Sum the three disjoint prompt-side billing buckets (same rule as the stats line). */
		function billedInputTokens(usage) {
			return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
		}
		/** Minutes since local midnight. */
		function minutesOfTime(time) {
			const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
			if (match === null) return NaN;
			return Number(match[1]) * 60 + Number(match[2]);
		}
		/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
		function weekdayOf(date) {
			const day = date.getDay();
			return day === 0 ? 7 : day;
		}
		/** The weekday before `weekday`, wrapping Sunday back to Saturday. */
		function previousWeekday(weekday) {
			return weekday === 1 ? 7 : weekday - 1;
		}
		/** Normalize one configured day list: integers 1–7, de-duplicated and sorted. */
		function normalizeDays(days) {
			if (days === void 0) return [];
			const seen = /* @__PURE__ */ new Set();
			for (const day of days) if (Number.isSafeInteger(day) && day >= 1 && day <= 7) seen.add(day);
			return [...seen].sort((left, right) => left - right);
		}
		/**
		* Whether one window is active at `time` (epoch ms, local time), honoring both
		* its time span and its weekday selection. A window with `start < end` is a
		* plain same-day span; one with `start > end` crosses midnight and is charged
		* to the weekday it started on.
		* @param window - the window whose span and days are checked.
		* @param time - billing instant.
		* @returns true when the instant bills at this window's prices.
		*/
		function isWindowActiveAt(window, time) {
			const startMinutes = minutesOfTime(window.start);
			const endMinutes = minutesOfTime(window.end);
			if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || startMinutes === endMinutes) return false;
			const days = normalizeDays(window.days);
			if (days.length === 0) return false;
			const date = new Date(time);
			const minutes = date.getHours() * 60 + date.getMinutes();
			const weekday = weekdayOf(date);
			if (startMinutes < endMinutes) return minutes >= startMinutes && minutes < endMinutes && days.includes(weekday);
			if (minutes >= startMinutes) return days.includes(weekday);
			if (minutes < endMinutes) return days.includes(previousWeekday(weekday));
			return false;
		}
		/**
		* Group selected weekdays into inclusive ISO ranges for compact display
		* (`[1,2,3,4,5]` → `[[1,5]]`). A Sunday-first run such as `[6,7,1]` is not
		* wrapped: the calendar week ends on Sunday.
		* @param days - configured day numbers (any order, duplicates allowed).
		* @returns inclusive `[first, last]` ranges in ascending order.
		*/
		function dayRanges(days) {
			const normalized = normalizeDays(days);
			const ranges = [];
			for (const day of normalized) {
				const last = ranges.at(-1);
				if (last !== void 0 && day === last[1] + 1) last[1] = day;
				else ranges.push([day, day]);
			}
			return ranges;
		}
		/**
		* The active peak window for one tier at `time` (epoch ms, local time).
		* @param tier - the tier whose windows are checked.
		* @param time - billing instant.
		* @returns the first matching window, or null.
		*/
		function activePeakWindow(tier, time) {
			for (const window of tier.peakWindows) if (isWindowActiveAt(window, time)) return window;
			return null;
		}
		/**
		* Resolve the price tier for one model at one billing instant: its table
		* entry when present (with peak windows applied), the `default` fallback
		* otherwise.
		* @param config - the local price table.
		* @param model - provider-owned model id, or null/undefined when unknown.
		* @param time - billing instant (epoch ms, local time).
		* @returns the applicable tier and the matched peak window, if any.
		*/
		function resolveTierAt(config, model, time) {
			const base = model !== null && model !== void 0 && config.models[model] !== void 0 ? config.models[model] : config.default;
			const peakWindow = activePeakWindow(base, time);
			return peakWindow === null ? {
				tier: base,
				peakWindow: null
			} : {
				tier: peakWindow,
				peakWindow
			};
		}
		/**
		* The active peak window for one model right now, or null. Used by the dock
		* to warn while the current session's model is billing at peak prices.
		*/
		function currentPeakWindow(config, model, now) {
			return resolveTierAt(config, model, now).peakWindow;
		}
		/**
		* Compact token count: 517 / 12.2K / 517K / 1.2M (one decimal under three
		* digits) — the same display rule the shipped stats line uses.
		* @param n - token count.
		* @returns display string.
		*/
		function formatTokens(n) {
			const scaled = (v) => v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
			if (n < 1e3) return String(n);
			if (n < 1e6) return `${scaled(n / 1e3)}K`;
			return `${scaled(n / 1e6)}M`;
		}
		/**
		* Format an estimated cost: four decimals under one cent, three under one
		* unit, two from there on.
		* @param cost - cost in the configured currency.
		* @returns display string without the currency symbol.
		*/
		function formatCost(cost) {
			const decimals = cost > 0 && cost < .01 ? 4 : cost < 1 ? 3 : 2;
			return cost.toFixed(decimals);
		}
		//#endregion
		//#region src/client/days.ts
		/**
		* Weekday selection vocabulary shared by the cost readout and the settings
		* section: the localized labels, the draft defaults, the toggle fold, and the
		* compact display of a selection.
		*
		* Pure functions only — the React components own the state; this module owns the
		* rules, so the rules stay testable without a DOM.
		*/
		/** The weekdays a window offers, with the locale key of each short label. */
		const WEEKDAY_LABELS = [
			{
				day: 1,
				key: "days.mon"
			},
			{
				day: 2,
				key: "days.tue"
			},
			{
				day: 3,
				key: "days.wed"
			},
			{
				day: 4,
				key: "days.thu"
			},
			{
				day: 5,
				key: "days.fri"
			},
			{
				day: 6,
				key: "days.sat"
			},
			{
				day: 7,
				key: "days.sun"
			}
		];
		/** Every ISO weekday, the "every day" preset. */
		const EVERY_DAY = [
			1,
			2,
			3,
			4,
			5,
			6,
			7
		];
		/**
		* The weekday selection of one window as an editable draft. A window written
		* before weekday selection existed carries no `days`; it resolves to the shipped
		* workweek default rather than to "never", so an older value cannot silently
		* disable a configured branch.
		* @param window - persisted peak window.
		* @returns normalized ISO weekday numbers.
		*/
		function draftDays(window) {
			const days = window.days;
			return normalizeDays(days === void 0 ? DEFAULT_PEAK_DAYS : days);
		}
		/**
		* Add or remove one weekday from a selection, keeping it sorted.
		* @param days - current selection.
		* @param day - ISO weekday to toggle.
		* @returns the next selection.
		*/
		function toggleDay(days, day) {
			const next = new Set(normalizeDays(days));
			if (next.has(day)) next.delete(day);
			else next.add(day);
			return [...next].sort((left, right) => left - right);
		}
		/**
		* Localized weekday summary of one selection, grouping consecutive days
		* (`[1,2,3,4,5]` → `Mon–Fri`). An empty selection reads as an em dash.
		* @param days - configured ISO weekday numbers.
		* @param t - namespace-bound translator.
		* @returns display text for the selection.
		*/
		function formatDays(days, t) {
			const ranges = dayRanges(days);
			if (ranges.length === 0) return "—";
			return ranges.map(([first, last]) => {
				const firstKey = WEEKDAY_LABELS[first - 1]?.key ?? "days.mon";
				const lastKey = WEEKDAY_LABELS[last - 1]?.key ?? "days.mon";
				return first === last ? t(firstKey) : `${t(firstKey)}\u2013${t(lastKey)}`;
			}).join(", ");
		}
		//#endregion
		//#region \0dsh-css:./src/client/CostDock.module.css.module.css.mjs
		const css$1 = ".qcz85a_root{box-sizing:border-box;width:100%;max-width:var(--dsh-chat-content-width);padding:2px calc(var(--dsh-composer-side-clearance) + 16px) 0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));justify-content:center;margin:0 auto;display:flex}.qcz85a_anchor{min-width:0;display:inline-flex}.qcz85a_pill{box-sizing:border-box;max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;line-height:inherit;font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer;background:0 0;border:none;border-radius:24px;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}.qcz85a_pill svg{flex:none;width:14px;height:14px}.qcz85a_pill:hover,.qcz85a_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.qcz85a_pill:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}.qcz85a_label{text-overflow:ellipsis;min-width:0;overflow:hidden}.qcz85a_sep{color:var(--dsw-alias-separator-primary);margin:0 6px}.qcz85a_value{font-variant-numeric:tabular-nums}.qcz85a_peak{border:1px solid var(--dsw-alias-state-warning-border,var(--dsw-alias-border-l2));color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-tertiary));border-radius:6px;flex:none;padding:0 6px;font-size:11px;line-height:16px}.qcz85a_panel{z-index:1100;box-sizing:border-box;background:var(--dsw-specific-menu);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;border-radius:12px;padding:16px;font-size:12px;line-height:18px;position:fixed}.qcz85a_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}.qcz85a_titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}.qcz85a_titleLabel svg{flex:none;width:14px;height:14px}.qcz85a_titleValue{font-variant-numeric:tabular-nums}.qcz85a_titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}.qcz85a_details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}.qcz85a_details dt,.qcz85a_details dd{min-width:0;margin:0}.qcz85a_details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}";
		const tagId$1 = "dsh-cost-meter/CostDock.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-cost-meter";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var CostDock_module_css_module_css_default = {
			"label": "qcz85a_label",
			"sep": "qcz85a_sep",
			"anchor": "qcz85a_anchor",
			"titleLabel": "qcz85a_titleLabel",
			"titleRule": "qcz85a_titleRule",
			"pill": "qcz85a_pill",
			"peak": "qcz85a_peak",
			"titleValue": "qcz85a_titleValue",
			"value": "qcz85a_value",
			"root": "qcz85a_root",
			"panel": "qcz85a_panel",
			"title": "qcz85a_title",
			"details": "qcz85a_details"
		};
		//#endregion
		//#region src/client/CostDock.tsx
		/**
		* Cost readout appended to the chat stats line: one entry in
		* `conversation.composer.dock` right after the shipped stats pills (order 0).
		*
		* The reading is a pill button. Clicking it opens a detail panel portaled to
		* `document.body` and clamped above the pill — the same interaction, primitives
		* (`useAnchoredPosition` + `useDismissOnOutsidePointer`) and surface skin as the
		* shipped session-stats / token-usage pills. A second click, an outside
		* pointerdown, or Escape closes it.
		*
		* The figure is the sum of the session's durable per-step ledger entries
		* (immutable price snapshots), not a live re-estimate. The panel also reports
		* whether the current model is inside one of its configured peak windows.
		*/
		/** Gap kept between the pill and its panel (the shipped stat dialogs' value). */
		const PANEL_GAP = 8;
		/** Viewport margin the panel's placement clamp keeps (the shipped value). */
		const PANEL_MARGIN = 12;
		/**
		* Layout for the unplaced portal panel: hidden but laid out, so the placement
		* hook's first pass measures real dimensions before anything paints.
		*/
		const MEASURE_STYLE = {
			visibility: "hidden",
			left: 0,
			top: 0
		};
		/**
		* Read the session's durable cost ledger, refetching whenever the usage
		* projection advances (a step just billed) and every 30 seconds (archive
		* reconciliation and peak-time refreshes).
		*/
		function useSessionLedger(sessionId, usage) {
			const [state, setState] = (0, react.useState)({
				snapshot: null,
				failed: false
			});
			(0, react.useEffect)(() => {
				let cancelled = false;
				const load = () => {
					fetch(`/dsh-cost-meter/sessions/${encodeURIComponent(sessionId)}/ledger`).then((response) => {
						if (!response.ok) throw new Error(String(response.status));
						return response.json();
					}).then((body) => {
						if (cancelled) return;
						const payload = body;
						setState({
							snapshot: payload.ok === true && payload.archived !== true ? payload.value ?? null : null,
							failed: payload.ok !== true
						});
					}).catch(() => {
						if (!cancelled) setState((current) => ({
							...current,
							failed: true
						}));
					});
				};
				load();
				const timer = setInterval(load, 3e4);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [sessionId, usage]);
			return state;
		}
		/** Local `HH:mm` window label. */
		function formatWindow(start, end) {
			return `${start}\u2013${end}`;
		}
		/**
		* Render the ledger total after the stats line. Renders nothing until the
		* provider has reported usage, the price table and ledger have loaded, and at
		* least one step has a durable entry. The click-opened panel carries the priced
		* model, the active peak window with its weekdays, the billed step count, and
		* the per-bucket breakdown.
		* @param props - composed slot props.
		* @returns the cost pill and its detail panel, or null while there is nothing to show.
		*/
		function CostDock({ sessionId, useProjection, useConfig, useModel, t }) {
			const usage = useProjection("tokenUsage");
			const config = useConfig();
			const model = useModel();
			const ledger = useSessionLedger(sessionId, usage);
			const [now, setNow] = (0, react.useState)(() => Date.now());
			const [open, setOpen] = (0, react.useState)(false);
			const rootRef = (0, react.useRef)(null);
			const panelRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const timer = setInterval(() => setNow(Date.now()), 3e4);
				return () => {
					clearInterval(timer);
				};
			}, []);
			const pos = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)({
				open,
				anchorRef: rootRef,
				panelRef,
				side: "top",
				gap: PANEL_GAP,
				margin: PANEL_MARGIN
			});
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(rootRef, open, setOpen, panelRef);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open]);
			const snapshot = ledger.snapshot;
			const show = usage !== void 0 && config !== null && (billedInputTokens(usage) !== 0 || usage.outputTokens !== 0) && snapshot !== null && snapshot.entries.length > 0;
			(0, react.useEffect)(() => {
				if (!show && open) setOpen(false);
			}, [show, open]);
			if (!show) return null;
			const peak = currentPeakWindow(config, model, now);
			const symbol = CURRENCY_SYMBOLS[config.currency];
			const total = `~${symbol}${formatCost(snapshot.costs.totalCost)}`;
			const modelLine = model !== null ? model : t("dock.fallback");
			const rows = [{
				key: "model",
				label: t("dock.model"),
				value: modelLine
			}, {
				key: "entries",
				label: t("dock.entries"),
				value: String(snapshot.entries.length)
			}];
			if (peak !== null) {
				rows.push({
					key: "window",
					label: t("dock.peakWindow"),
					value: `${formatWindow(peak.start, peak.end)} \u00b7 ${t("dock.peakActive")}`
				});
				rows.push({
					key: "days",
					label: t("dock.peakDays"),
					value: formatDays(peak.days, t)
				});
			}
			rows.push({
				key: "hit",
				label: t("dock.cacheHit"),
				value: `${formatTokens(snapshot.tokens.cacheHitTokens)} \u00b7 ${symbol}${formatCost(snapshot.costs.cacheHitCost)}`
			});
			rows.push({
				key: "miss",
				label: t("dock.cacheMiss"),
				value: `${formatTokens(snapshot.tokens.cacheMissTokens)} \u00b7 ${symbol}${formatCost(snapshot.costs.cacheMissCost)}`
			});
			rows.push({
				key: "output",
				label: t("dock.output"),
				value: `${formatTokens(snapshot.tokens.outputTokens)} \u00b7 ${symbol}${formatCost(snapshot.costs.outputCost)}`
			});
			const ariaLabel = peak === null ? `${t("dock.estimate")} ${total}` : `${t("dock.estimate")} ${total} \u00b7 ${t("dock.peak")} ${formatWindow(peak.start, peak.end)}`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: CostDock_module_css_module_css_default.root,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					ref: rootRef,
					className: CostDock_module_css_module_css_default.anchor,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: CostDock_module_css_module_css_default.pill,
						"aria-haspopup": "dialog",
						"aria-expanded": open,
						"aria-label": ariaLabel,
						onClick: () => {
							setOpen(!open);
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutline16, {}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: CostDock_module_css_module_css_default.label,
								children: [
									t("dock.estimate"),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: CostDock_module_css_module_css_default.sep,
										"aria-hidden": true,
										children: "·"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: CostDock_module_css_module_css_default.value,
										children: total
									})
								]
							}),
							peak !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: CostDock_module_css_module_css_default.peak,
								children: t("dock.peak")
							})
						]
					}), open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: panelRef,
						className: CostDock_module_css_module_css_default.panel,
						role: "dialog",
						"aria-label": t("dock.title"),
						style: pos ?? MEASURE_STYLE,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CostDock_module_css_module_css_default.title,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: CostDock_module_css_module_css_default.titleLabel,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutline16, {}), t("dock.title")]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CostDock_module_css_module_css_default.titleValue,
									children: total
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CostDock_module_css_module_css_default.titleRule,
								"aria-hidden": true
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dl", {
								className: CostDock_module_css_module_css_default.details,
								children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: row.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: row.value })] }, row.key))
							})
						]
					}), document.body)]
				})
			});
		}
		//#endregion
		//#region \0dsh-css:./src/client/CostSettingsSection.module.css.module.css.mjs
		const css = ".ilN6fW_group{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:8px;padding:16px 0;display:flex}.ilN6fW_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}.ilN6fW_hint{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.ilN6fW_currencyRow{align-items:center;gap:8px;margin-top:4px;font-size:13px;line-height:20px;display:flex}.ilN6fW_fieldLabel{color:var(--dsw-alias-label-secondary);flex:0 0 110px}.ilN6fW_select{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);min-width:140px;height:30px;font:inherit;color:var(--dsw-alias-label-primary);background:0 0;border-radius:8px;padding:0 8px;font-size:13px;line-height:20px}.ilN6fW_block{flex-direction:column;gap:6px;margin-top:8px;display:flex}.ilN6fW_blockTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}.ilN6fW_blockHint{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.ilN6fW_tierRow{flex-wrap:wrap;align-items:center;gap:12px;display:flex}.ilN6fW_modelRow{flex-wrap:wrap;align-items:center;gap:12px;padding:4px 0;display:flex}.ilN6fW_nameInput{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:200px;height:30px;font:inherit;color:var(--dsw-alias-label-primary);background:0 0;border-radius:8px;padding:0 8px;font-size:13px;line-height:20px}.ilN6fW_priceCell{align-items:center;gap:6px;display:flex}.ilN6fW_priceLabel{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.ilN6fW_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:90px;height:30px;font:inherit;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;background:0 0;border-radius:8px;padding:0 8px;font-size:13px;line-height:20px}.ilN6fW_unit{color:var(--dsw-alias-label-caption);flex:none;font-size:13px;line-height:20px}.ilN6fW_addButton{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:8px;align-self:flex-start;padding:5px 14px;font-size:13px;line-height:20px}.ilN6fW_addButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.ilN6fW_removeButton{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:8px;padding:3px 10px;font-size:12px;line-height:18px}.ilN6fW_removeButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-error-primary)}.ilN6fW_actions{flex-wrap:wrap;align-items:center;gap:12px;margin-top:8px;display:flex}.ilN6fW_button{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:8px;padding:5px 14px;font-size:13px;line-height:20px}.ilN6fW_button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.ilN6fW_button:disabled,.ilN6fW_select:disabled,.ilN6fW_input:disabled,.ilN6fW_nameInput:disabled,.ilN6fW_timeInput:disabled,.ilN6fW_addButton:disabled,.ilN6fW_removeButton:disabled,.ilN6fW_dayButton:disabled,.ilN6fW_dayButtonActive:disabled,.ilN6fW_dayPreset:disabled{opacity:.6;cursor:default}.ilN6fW_select:focus-visible,.ilN6fW_input:focus-visible,.ilN6fW_nameInput:focus-visible,.ilN6fW_timeInput:focus-visible,.ilN6fW_button:focus-visible,.ilN6fW_addButton:focus-visible,.ilN6fW_removeButton:focus-visible,.ilN6fW_dayButton:focus-visible,.ilN6fW_dayButtonActive:focus-visible,.ilN6fW_dayPreset:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}.ilN6fW_statusOk{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.ilN6fW_statusError{color:var(--dsw-alias-color-danger,var(--dsw-alias-label-primary));font-size:13px;line-height:20px}.ilN6fW_modelBlock{flex-direction:column;gap:8px;padding:4px 0 10px;display:flex}.ilN6fW_modelBlock+.ilN6fW_modelBlock{border-top:1px dashed var(--dsw-alias-border-l2)}.ilN6fW_priceGroupLabel{color:var(--dsw-alias-label-caption);flex:none;font-size:13px;line-height:20px}.ilN6fW_toggleRow{color:var(--dsw-alias-label-secondary);align-items:center;gap:8px;font-size:13px;line-height:20px;display:flex}.ilN6fW_toggleRow input{accent-color:var(--dsw-alias-label-primary);margin:0}.ilN6fW_peakBlock{border-left:2px solid var(--dsw-alias-border-l2);flex-direction:column;gap:8px;padding:8px 0 0 12px;display:flex}.ilN6fW_peakWindowRow{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex-direction:column;gap:6px;padding:8px 10px;display:flex}.ilN6fW_timeRow,.ilN6fW_priceRow{flex-wrap:wrap;align-items:center;gap:12px;display:flex}.ilN6fW_dayRow{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.ilN6fW_dayButtons{align-items:center;gap:4px;display:flex}.ilN6fW_dayButton,.ilN6fW_dayButtonActive{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);min-width:30px;height:26px;font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:6px;padding:0 6px;font-size:12px;line-height:18px}.ilN6fW_dayButtonActive{border-color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:500}.ilN6fW_dayButton:hover:not(:disabled),.ilN6fW_dayButtonActive:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.ilN6fW_dayPreset{box-sizing:border-box;border:1px dashed var(--dsw-alias-border-l2);height:26px;font:inherit;color:var(--dsw-alias-label-caption);cursor:pointer;background:0 0;border-radius:6px;padding:0 8px;font-size:12px;line-height:18px}.ilN6fW_dayPreset:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.ilN6fW_dayWarning{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}.ilN6fW_timeCell{align-items:center;gap:6px;display:flex}.ilN6fW_timeInput{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:110px;height:30px;font:inherit;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;background:0 0;border-radius:8px;padding:0 8px;font-size:13px;line-height:20px}";
		const tagId = "dsh-cost-meter/CostSettingsSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-cost-meter";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var CostSettingsSection_module_css_module_css_default = {
			"priceGroupLabel": "ilN6fW_priceGroupLabel",
			"modelRow": "ilN6fW_modelRow",
			"timeCell": "ilN6fW_timeCell",
			"currencyRow": "ilN6fW_currencyRow",
			"blockTitle": "ilN6fW_blockTitle",
			"priceLabel": "ilN6fW_priceLabel",
			"addButton": "ilN6fW_addButton",
			"peakWindowRow": "ilN6fW_peakWindowRow",
			"dayButtonActive": "ilN6fW_dayButtonActive",
			"unit": "ilN6fW_unit",
			"timeRow": "ilN6fW_timeRow",
			"removeButton": "ilN6fW_removeButton",
			"toggleRow": "ilN6fW_toggleRow",
			"dayButton": "ilN6fW_dayButton",
			"title": "ilN6fW_title",
			"priceRow": "ilN6fW_priceRow",
			"priceCell": "ilN6fW_priceCell",
			"nameInput": "ilN6fW_nameInput",
			"dayRow": "ilN6fW_dayRow",
			"actions": "ilN6fW_actions",
			"tierRow": "ilN6fW_tierRow",
			"dayPreset": "ilN6fW_dayPreset",
			"statusError": "ilN6fW_statusError",
			"peakBlock": "ilN6fW_peakBlock",
			"button": "ilN6fW_button",
			"timeInput": "ilN6fW_timeInput",
			"blockHint": "ilN6fW_blockHint",
			"input": "ilN6fW_input",
			"hint": "ilN6fW_hint",
			"modelBlock": "ilN6fW_modelBlock",
			"dayButtons": "ilN6fW_dayButtons",
			"dayWarning": "ilN6fW_dayWarning",
			"statusOk": "ilN6fW_statusOk",
			"block": "ilN6fW_block",
			"group": "ilN6fW_group",
			"fieldLabel": "ilN6fW_fieldLabel",
			"select": "ilN6fW_select"
		};
		//#endregion
		//#region src/client/CostSettingsSection.tsx
		/**
		* Settings page editing the per-model price table: currency, a `default`
		* fallback tier, and a list of per-model tiers. Each model tier can enable
		* any number of daily peak-time windows; every window carries its own three
		* prices. Renders as one Settings section (`settings.section`); reads/writes
		* through this plugin's host routes via the injected save/reset face.
		*/
		/** Price fields rendered as number inputs, in display order. */
		const PRICE_FIELDS = [
			{
				field: "cacheHitPrice",
				labelKey: "prices.cacheHit"
			},
			{
				field: "cacheMissPrice",
				labelKey: "prices.cacheMiss"
			},
			{
				field: "outputPrice",
				labelKey: "prices.output"
			}
		];
		let nextUid = 1;
		/** Strip the branch metadata and copy the three base prices. */
		function basePrices(tier) {
			return {
				cacheHitPrice: tier.cacheHitPrice,
				cacheMissPrice: tier.cacheMissPrice,
				outputPrice: tier.outputPrice,
				peakWindows: []
			};
		}
		/** Convert the persisted record to the editable array draft. */
		function toDraft(config) {
			return {
				currency: config.currency,
				default: { ...config.default },
				models: Object.entries(config.models).map(([name, tier]) => ({
					uid: nextUid++,
					name,
					tier: basePrices(tier),
					peakEnabled: tier.peakWindows.length > 0,
					peakWindows: tier.peakWindows.map((window) => ({
						...window,
						days: draftDays(window),
						uid: nextUid++
					}))
				}))
			};
		}
		/** Convert the editable array draft back to the persisted record. */
		function fromDraft(draft) {
			const models = {};
			for (const model of draft.models) {
				const name = model.name.trim();
				if (name === "") continue;
				models[name] = {
					...model.tier,
					...model.peakEnabled && model.peakWindows.length > 0 ? { peakWindows: model.peakWindows.map(({ uid: _uid, ...window }) => window) } : {}
				};
			}
			return {
				currency: draft.currency,
				default: draft.default,
				models
			};
		}
		/** One numeric price input with a local text draft so typing decimals stays smooth. */
		function NumberField(props) {
			const { value, disabled, onChange } = props;
			const [text, setText] = (0, react.useState)(String(value));
			const [focused, setFocused] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (!focused) setText(String(value));
			}, [value, focused]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				className: CostSettingsSection_module_css_module_css_default.input,
				type: "number",
				min: "0",
				step: "0.01",
				inputMode: "decimal",
				disabled,
				value: text,
				onFocus: () => setFocused(true),
				onBlur: () => {
					setFocused(false);
					const parsed = Number(text);
					if (Number.isFinite(parsed) && parsed >= 0 && parsed !== value) onChange(parsed);
				},
				onChange: (e) => {
					setText(e.target.value);
					if (e.target.value.trim() === "") return;
					const parsed = Number(e.target.value);
					if (Number.isFinite(parsed) && parsed >= 0) onChange(parsed);
				}
			});
		}
		/** One local `HH:mm` time input. */
		function TimeField(props) {
			const { value, disabled, onChange } = props;
			const [text, setText] = (0, react.useState)(value);
			const [focused, setFocused] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (!focused) setText(value);
			}, [value, focused]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				className: CostSettingsSection_module_css_module_css_default.timeInput,
				type: "time",
				disabled,
				value: text,
				onFocus: () => setFocused(true),
				onBlur: () => {
					setFocused(false);
					if (/^([01]\d|2[0-3]):[0-5]\d$/.test(text) && text !== value) onChange(text);
					else setText(value);
				},
				onChange: (e) => {
					setText(e.target.value);
				}
			});
		}
		/** The three price cells shared by base and peak tiers. */
		function PriceCells(props) {
			const { tier, disabled, t, onChange } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: PRICE_FIELDS.map(({ field, labelKey }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: CostSettingsSection_module_css_module_css_default.priceCell,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CostSettingsSection_module_css_module_css_default.priceLabel,
					children: t(labelKey)
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
					value: tier[field],
					disabled,
					onChange: (v) => onChange(field, v)
				})]
			}, field)) });
		}
		/** The weekday multi-select of one peak window (any subset of Monday–Sunday). */
		function DayPicker(props) {
			const { days, disabled, t, onChange } = props;
			const selected = new Set(normalizeDays(days));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CostSettingsSection_module_css_module_css_default.dayRow,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CostSettingsSection_module_css_module_css_default.priceLabel,
						children: t("models.peakDays")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CostSettingsSection_module_css_module_css_default.dayButtons,
						children: WEEKDAY_LABELS.map(({ day, key }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: selected.has(day) ? CostSettingsSection_module_css_module_css_default.dayButtonActive : CostSettingsSection_module_css_module_css_default.dayButton,
							"aria-pressed": selected.has(day),
							disabled,
							onClick: () => onChange(toggleDay(days, day)),
							children: t(key)
						}, day))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: CostSettingsSection_module_css_module_css_default.dayPreset,
						disabled,
						onClick: () => onChange([...DEFAULT_PEAK_DAYS]),
						children: t("models.peakDaysWorkweek")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: CostSettingsSection_module_css_module_css_default.dayPreset,
						disabled,
						onClick: () => onChange([...EVERY_DAY]),
						children: t("models.peakDaysEveryDay")
					}),
					selected.size === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CostSettingsSection_module_css_module_css_default.dayWarning,
						children: t("models.peakDaysNone")
					})
				]
			});
		}
		/** One editable peak window row. */
		function PeakWindowRow(props) {
			const { window, disabled, t, onChange, onRemove } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CostSettingsSection_module_css_module_css_default.peakWindowRow,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CostSettingsSection_module_css_module_css_default.timeRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: CostSettingsSection_module_css_module_css_default.timeCell,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CostSettingsSection_module_css_module_css_default.priceLabel,
									children: t("models.peakStart")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TimeField, {
									value: window.start,
									disabled,
									onChange: (v) => onChange(window.uid, (w) => {
										w.start = v;
									})
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: CostSettingsSection_module_css_module_css_default.timeCell,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CostSettingsSection_module_css_module_css_default.priceLabel,
									children: t("models.peakEnd")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TimeField, {
									value: window.end,
									disabled,
									onChange: (v) => onChange(window.uid, (w) => {
										w.end = v;
									})
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: CostSettingsSection_module_css_module_css_default.removeButton,
								disabled,
								onClick: () => onRemove(window.uid),
								children: t("models.peakRemove")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DayPicker, {
						days: window.days,
						disabled,
						t,
						onChange: (days) => onChange(window.uid, (w) => {
							w.days = days;
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CostSettingsSection_module_css_module_css_default.priceRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CostSettingsSection_module_css_module_css_default.priceGroupLabel,
							children: t("models.peakPrices")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PriceCells, {
							tier: window,
							disabled,
							t,
							onChange: (field, value) => onChange(window.uid, (w) => {
								w[field] = value;
							})
						})]
					})
				]
			});
		}
		/** One editable per-model tier row plus its peak branch. */
		function ModelRow(props) {
			const { model, disabled, t, onChangeName, onChangePrice, onTogglePeak, onChangeWindow, onAddWindow, onRemoveWindow, onRemove } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CostSettingsSection_module_css_module_css_default.modelBlock,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CostSettingsSection_module_css_module_css_default.modelRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: CostSettingsSection_module_css_module_css_default.nameInput,
								type: "text",
								value: model.name,
								placeholder: t("models.namePlaceholder"),
								disabled,
								onChange: (e) => onChangeName(e.target.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: CostSettingsSection_module_css_module_css_default.priceGroupLabel,
								children: t("models.basePrices")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PriceCells, {
								tier: model.tier,
								disabled,
								t,
								onChange: onChangePrice
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: CostSettingsSection_module_css_module_css_default.removeButton,
								disabled,
								onClick: onRemove,
								children: t("models.remove")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: CostSettingsSection_module_css_module_css_default.toggleRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: model.peakEnabled,
							disabled,
							onChange: (e) => onTogglePeak(e.target.checked)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("models.peakToggle") })]
					}),
					model.peakEnabled && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CostSettingsSection_module_css_module_css_default.peakBlock,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CostSettingsSection_module_css_module_css_default.blockHint,
								children: t("models.peakHint")
							}),
							model.peakWindows.map((window) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PeakWindowRow, {
								window,
								disabled,
								t,
								onChange: onChangeWindow,
								onRemove: onRemoveWindow
							}, window.uid)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: CostSettingsSection_module_css_module_css_default.addButton,
								disabled,
								onClick: onAddWindow,
								children: t("models.peakAdd")
							})
						]
					})
				]
			});
		}
		/**
		* Render the price-table section.
		* @param props - composed slot props.
		* @returns the section element tree.
		*/
		function CostSettingsSection({ t, useConfig, save, reset }) {
			const config = useConfig();
			const [draft, setDraft] = (0, react.useState)(null);
			const [saveState, setSaveState] = (0, react.useState)({ phase: "idle" });
			(0, react.useEffect)(() => {
				if (config !== null) setDraft((current) => current ?? toDraft(config));
			}, [config]);
			const disabled = draft === null;
			const setDraftField = (mutate) => {
				setDraft((d) => {
					if (d === null) return d;
					const next = {
						currency: d.currency,
						default: { ...d.default },
						models: d.models.map((m) => ({
							...m,
							tier: { ...m.tier },
							peakWindows: m.peakWindows.map((w) => ({ ...w }))
						}))
					};
					mutate(next);
					return next;
				});
			};
			const onSave = () => {
				if (draft === null) return;
				setSaveState({ phase: "saving" });
				save(fromDraft(draft)).then((value) => {
					setDraft(toDraft(value));
					setSaveState({ phase: "saved" });
				}).catch((error) => setSaveState({
					phase: "error",
					message: error instanceof Error ? error.message : String(error)
				}));
			};
			const onReset = () => {
				if (!window.confirm(t("actions.resetConfirm"))) return;
				setSaveState({ phase: "saving" });
				reset().then((value) => {
					setDraft(toDraft(value));
					setSaveState({ phase: "saved" });
				}).catch((error) => setSaveState({
					phase: "error",
					message: error instanceof Error ? error.message : String(error)
				}));
			};
			if (draft === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CostSettingsSection_module_css_module_css_default.group,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CostSettingsSection_module_css_module_css_default.title,
					children: t("title")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CostSettingsSection_module_css_module_css_default.hint,
					children: config === null ? t("loading") : t("loadFailed")
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CostSettingsSection_module_css_module_css_default.group,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CostSettingsSection_module_css_module_css_default.title,
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CostSettingsSection_module_css_module_css_default.hint,
						children: t("hint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CostSettingsSection_module_css_module_css_default.currencyRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CostSettingsSection_module_css_module_css_default.fieldLabel,
							children: t("currency")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							className: CostSettingsSection_module_css_module_css_default.select,
							value: draft.currency,
							disabled,
							onChange: (e) => {
								const next = e.target.value;
								if (next === "CNY" || next === "USD") setDraftField((d) => {
									d.currency = next;
								});
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "CNY",
								children: t("currency.cny")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "USD",
								children: t("currency.usd")
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CostSettingsSection_module_css_module_css_default.block,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CostSettingsSection_module_css_module_css_default.blockTitle,
								children: t("default.title")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CostSettingsSection_module_css_module_css_default.blockHint,
								children: t("default.hint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CostSettingsSection_module_css_module_css_default.tierRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PriceCells, {
									tier: draft.default,
									disabled,
									t,
									onChange: (field, value) => setDraftField((d) => {
										d.default[field] = value;
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CostSettingsSection_module_css_module_css_default.unit,
									children: t("prices.unit")
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CostSettingsSection_module_css_module_css_default.block,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CostSettingsSection_module_css_module_css_default.blockTitle,
								children: t("models.title")
							}),
							draft.models.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CostSettingsSection_module_css_module_css_default.blockHint,
								children: t("models.empty")
							}),
							draft.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelRow, {
								model,
								disabled,
								t,
								onChangeName: (name) => setDraftField((d) => {
									const row = d.models.find((m) => m.uid === model.uid);
									if (row !== void 0) row.name = name;
								}),
								onChangePrice: (field, value) => setDraftField((d) => {
									const row = d.models.find((m) => m.uid === model.uid);
									if (row !== void 0) row.tier[field] = value;
								}),
								onTogglePeak: (enabled) => setDraftField((d) => {
									const row = d.models.find((m) => m.uid === model.uid);
									if (row !== void 0) row.peakEnabled = enabled;
								}),
								onChangeWindow: (uid, mutate) => setDraftField((d) => {
									const window = d.models.find((m) => m.uid === model.uid)?.peakWindows.find((w) => w.uid === uid);
									if (window !== void 0) mutate(window);
								}),
								onAddWindow: () => setDraftField((d) => {
									const row = d.models.find((m) => m.uid === model.uid);
									if (row === void 0) return;
									row.peakEnabled = true;
									const uid = nextUid++;
									row.peakWindows.push({
										uid,
										id: `peak-${uid}`,
										start: "09:00",
										end: "21:00",
										days: [...DEFAULT_PEAK_DAYS],
										cacheHitPrice: row.tier.cacheHitPrice,
										cacheMissPrice: row.tier.cacheMissPrice,
										outputPrice: row.tier.outputPrice
									});
								}),
								onRemoveWindow: (uid) => setDraftField((d) => {
									const row = d.models.find((m) => m.uid === model.uid);
									if (row !== void 0) row.peakWindows = row.peakWindows.filter((w) => w.uid !== uid);
								}),
								onRemove: () => setDraftField((d) => {
									d.models = d.models.filter((m) => m.uid !== model.uid);
								})
							}, model.uid)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: CostSettingsSection_module_css_module_css_default.addButton,
								disabled,
								onClick: () => setDraftField((d) => {
									d.models.push({
										uid: nextUid++,
										name: "",
										tier: basePrices(d.default),
										peakEnabled: false,
										peakWindows: []
									});
								}),
								children: t("models.add")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CostSettingsSection_module_css_module_css_default.actions,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: CostSettingsSection_module_css_module_css_default.button,
								disabled: disabled || saveState.phase === "saving",
								onClick: onSave,
								children: saveState.phase === "saving" ? t("actions.saving") : t("actions.save")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: CostSettingsSection_module_css_module_css_default.button,
								disabled: disabled || saveState.phase === "saving",
								onClick: onReset,
								children: t("actions.reset")
							}),
							saveState.phase === "saved" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: CostSettingsSection_module_css_module_css_default.statusOk,
								role: "status",
								children: t("actions.saved")
							}),
							saveState.phase === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: CostSettingsSection_module_css_module_css_default.statusError,
								role: "alert",
								children: [
									t("actions.saveFailed"),
									": ",
									saveState.message
								]
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** dsh-cost-meter dictionaries (the zh key set is the source of truth). */
		/** Simplified Chinese dictionary. */
		const zh = {
			"nav": "预估花费价格表",
			"title": "预估花费价格表",
			"hint": "按模型配置“百万 tokens”单价（输入缓存命中 / 缓存未命中 / 输出），用于在对话统计行之后追加展示当前会话的预估花费。未列出模型使用“默认价格”。",
			"loading": "正在加载…",
			"loadFailed": "价格表加载失败，请刷新重试。",
			"currency": "币种",
			"currency.cny": "CNY（¥）",
			"currency.usd": "USD（$）",
			"default.title": "默认价格",
			"default.hint": "未在下表列出的模型使用此价格。",
			"models.title": "按模型价格",
			"models.empty": "尚未配置模型，仅使用默认价格。",
			"models.add": "添加模型",
			"models.namePlaceholder": "模型名称（如 deepseek-v4-flash）",
			"models.remove": "删除",
			"models.basePrices": "平时价格",
			"models.peakToggle": "启用峰谷定价",
			"models.peakHint": "每个时段均为本地时间，跨午夜请写为 22:00–06:00（跨午夜时段算在开始日）；多个时段重叠时按列表顺序取第一个。",
			"models.peakAdd": "添加峰值时段",
			"models.peakWindow": "峰值时段",
			"models.peakStart": "开始",
			"models.peakEnd": "结束",
			"models.peakDays": "生效星期",
			"models.peakDaysWorkweek": "工作日",
			"models.peakDaysEveryDay": "每天",
			"models.peakDaysNone": "未选择任何星期，该时段不会生效。",
			"models.peakPrices": "峰值价格",
			"models.peakRemove": "删除时段",
			"days.mon": "一",
			"days.tue": "二",
			"days.wed": "三",
			"days.thu": "四",
			"days.fri": "五",
			"days.sat": "六",
			"days.sun": "日",
			"prices.cacheHit": "输入缓存命中",
			"prices.cacheMiss": "输入缓存未命中",
			"prices.output": "输出",
			"prices.unit": "/ 1M tokens",
			"actions.save": "保存",
			"actions.saving": "保存中…",
			"actions.saved": "已保存",
			"actions.saveFailed": "保存失败",
			"actions.reset": "恢复默认",
			"actions.resetConfirm": "确定要恢复默认价格表吗？",
			"dock.estimate": "预估花费",
			"dock.title": "预估花费明细",
			"dock.model": "模型",
			"dock.fallback": "默认价格（未匹配模型）",
			"dock.cacheHit": "输入缓存命中",
			"dock.cacheMiss": "输入缓存未命中",
			"dock.output": "输出",
			"dock.peak": "峰值",
			"dock.peakWindow": "峰值时段",
			"dock.peakActive": "当前处于峰值时段",
			"dock.peakDays": "生效星期",
			"dock.entries": "已计费条目"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"nav": "Estimated cost pricing",
			"title": "Estimated cost pricing",
			"hint": "Per-model prices per 1M tokens (input cache hit / cache miss / output), used to append the current session’s estimated cost after the chat stats line. Models not listed below use the default price.",
			"loading": "Loading…",
			"loadFailed": "Failed to load the price table; please refresh and retry.",
			"currency": "Currency",
			"currency.cny": "CNY (¥)",
			"currency.usd": "USD ($)",
			"default.title": "Default price",
			"default.hint": "Models not listed below use this price.",
			"models.title": "Per-model prices",
			"models.empty": "No models configured; the default price applies to everything.",
			"models.add": "Add model",
			"models.namePlaceholder": "Model name (e.g. deepseek-v4-flash)",
			"models.remove": "Remove",
			"models.basePrices": "Off-peak prices",
			"models.peakToggle": "Enable peak pricing",
			"models.peakHint": "Windows use local time; enter 22:00–06:00 for an overnight window (it is charged to its start day). When windows overlap, the first match wins.",
			"models.peakAdd": "Add peak window",
			"models.peakWindow": "Peak window",
			"models.peakStart": "Start",
			"models.peakEnd": "End",
			"models.peakDays": "Active days",
			"models.peakDaysWorkweek": "Weekdays",
			"models.peakDaysEveryDay": "Every day",
			"models.peakDaysNone": "No weekday selected — this window never applies.",
			"models.peakPrices": "Peak prices",
			"models.peakRemove": "Remove window",
			"days.mon": "Mon",
			"days.tue": "Tue",
			"days.wed": "Wed",
			"days.thu": "Thu",
			"days.fri": "Fri",
			"days.sat": "Sat",
			"days.sun": "Sun",
			"prices.cacheHit": "Input cache hit",
			"prices.cacheMiss": "Input cache miss",
			"prices.output": "Output",
			"prices.unit": "/ 1M tokens",
			"actions.save": "Save",
			"actions.saving": "Saving…",
			"actions.saved": "Saved",
			"actions.saveFailed": "Save failed",
			"actions.reset": "Reset to defaults",
			"actions.resetConfirm": "Reset the price table to its defaults?",
			"dock.estimate": "Estimated cost",
			"dock.title": "Estimated cost breakdown",
			"dock.model": "Model",
			"dock.fallback": "Default price (no model matched)",
			"dock.cacheHit": "Input cache hit",
			"dock.cacheMiss": "Input cache miss",
			"dock.output": "Output",
			"dock.peak": "Peak",
			"dock.peakWindow": "Peak window",
			"dock.peakActive": "Currently in a peak window",
			"dock.peakDays": "Days",
			"dock.entries": "Billed entries"
		};
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-cost-meter browser half:
		*
		* - `CostDock` — one entry in `conversation.composer.dock` (order 1, right
		*   after the shipped stats line at order 0) that displays the sum of the
		*   session's durable per-step cost ledger and a live peak-time warning;
		* - `CostSettingsSection` — one Settings page (`settings.section`) editing the
		*   currency, the fallback tier, and per-model prices with optional
		*   multi-window peak pricing.
		*
		* The price table is read/written over this plugin's own same-origin routes
		* (`/dsh-cost-meter/*`), because the api-proxy settings allowlist does not
		* expose third-party settings namespaces to the browser.
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "dsh-cost-meter";
		/** Services required before the dock entry and settings section can register. */
		const inject = ["slots", "locale"];
		/** No-op subscription for the model-less fallback path. */
		const noopSubscribe = () => () => {};
		/**
		* Register the dictionaries, the composer-dock cost readout, and the
		* Settings price-table section.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-cost-meter: dictionaries");
			const t = ctx.locale.bind(NS);
			const store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(null);
			const getSnapshot = () => store.getSnapshot();
			const useConfig = () => (0, react.useSyncExternalStore)(store.subscribe, getSnapshot, getSnapshot);
			const load = () => {
				fetch("/dsh-cost-meter/config").then((response) => {
					if (!response.ok) throw new Error(String(response.status));
					return response.json();
				}).then((body) => {
					const value = body.value;
					if (value !== void 0) store.set(value);
				}).catch(() => {});
			};
			load();
			const save = async (config) => {
				const response = await fetch("/dsh-cost-meter/config", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(config)
				});
				const body = await response.json();
				if (!response.ok || body.ok !== true || body.value === void 0) throw new Error(body.error ?? `HTTP ${response.status}`);
				store.set(body.value);
				return body.value;
			};
			const reset = async () => {
				const response = await fetch("/dsh-cost-meter/reset", { method: "POST" });
				const body = await response.json();
				if (!response.ok || body.ok !== true || body.value === void 0) throw new Error(body.error ?? `HTTP ${response.status}`);
				store.set(body.value);
				return body.value;
			};
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "cost",
				order: 1,
				locale: NS,
				inject: (sessionId) => {
					const directories = ctx.get("modelDirectories");
					let directoryStore;
					if (directories !== void 0) try {
						directoryStore = directories.directoryFor(sessionId)?.store;
					} catch {}
					return {
						sessionId,
						useConfig,
						useModel: () => (0, react.useSyncExternalStore)(directoryStore !== void 0 ? directoryStore.subscribe : noopSubscribe, () => directoryStore?.getSnapshot()?.current?.model ?? null, () => null)
					};
				}
			}, CostDock));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-cost-meter",
				order: 22,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({
					useConfig,
					save,
					reset,
					reload: load
				})
			}, CostSettingsSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map