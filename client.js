window.__ModuleLoader__.load({
	id: "dsh-cost-meter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/pricing.ts
		/** Currency display symbols used by the browser half. */
		const CURRENCY_SYMBOLS = {
			CNY: "¥",
			USD: "$"
		};
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
		/** True when `time` (epoch ms, local time) is inside the `[start, end)` window. */
		function isInWindow(time, start, end) {
			const startMinutes = minutesOfTime(start);
			const endMinutes = minutesOfTime(end);
			if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || startMinutes === endMinutes) return false;
			const date = new Date(time);
			const minutes = date.getHours() * 60 + date.getMinutes();
			if (startMinutes < endMinutes) return minutes >= startMinutes && minutes < endMinutes;
			return minutes >= startMinutes || minutes < endMinutes;
		}
		/**
		* The active peak window for one tier at `time` (epoch ms, local time).
		* @param tier - the tier whose windows are checked.
		* @param time - billing instant.
		* @returns the first matching window, or null.
		*/
		function activePeakWindow(tier, time) {
			for (const window of tier.peakWindows) if (isInWindow(time, window.start, window.end)) return window;
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
		//#region \0dsh-css:./src/client/CostDock.module.css.mjs
		const css$1 = ".qcz85a_root{box-sizing:border-box;width:100%;max-width:var(--dsh-chat-content-width);padding:2px calc(var(--dsh-composer-side-clearance) + 16px) 0;color:var(--dsw-alias-label-tertiary);white-space:nowrap;justify-content:center;align-items:baseline;gap:6px;margin:0 auto;font-size:12px;line-height:20px;display:flex;overflow:hidden}.qcz85a_value{font-variant-numeric:tabular-nums}.qcz85a_peak{border:1px solid var(--dsw-alias-state-warning-border,var(--dsw-alias-border-l2));color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-tertiary));border-radius:6px;flex:none;padding:0 6px;font-size:11px;line-height:16px}";
		const tagId$1 = "dsh-cost-meter/CostDock.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-cost-meter";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var CostDock_module_css_default = {
			"peak": "qcz85a_peak",
			"root": "qcz85a_root",
			"value": "qcz85a_value"
		};
		//#endregion
		//#region src/client/CostDock.tsx
		/**
		* Cost readout appended to the chat stats line: one entry in
		* `conversation.composer.dock` right after the shipped stats entry (order 0).
		*
		* The figure is the sum of the session's durable per-step ledger entries
		* (immutable price snapshots), not a live re-estimate. It also warns while
		* the current model is inside one of its configured peak windows.
		*/
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
		* least one step has a durable entry. The hover tooltip carries the priced
		* model, the active peak window, the billed step count, and the per-bucket
		* breakdown.
		* @param props - composed slot props.
		* @returns the cost line element tree, or null while there is nothing to show.
		*/
		function CostDock({ sessionId, useProjection, useConfig, useModel, t }) {
			const usage = useProjection("tokenUsage");
			const config = useConfig();
			const model = useModel();
			const ledger = useSessionLedger(sessionId, usage);
			const [now, setNow] = (0, react.useState)(() => Date.now());
			(0, react.useEffect)(() => {
				const timer = setInterval(() => setNow(Date.now()), 3e4);
				return () => {
					clearInterval(timer);
				};
			}, []);
			if (usage === void 0) return null;
			if (config === null) return null;
			if (billedInputTokens(usage) === 0 && usage.outputTokens === 0) return null;
			const snapshot = ledger.snapshot;
			if (snapshot === null || snapshot.entries.length === 0) return null;
			const peak = currentPeakWindow(config, model, now);
			const symbol = CURRENCY_SYMBOLS[config.currency];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: [
					model !== null ? `${t("dock.model")} ${model}` : t("dock.fallback"),
					`${t("dock.entries")} ${snapshot.entries.length}`,
					...peak !== null ? [`${t("dock.peakWindow")} ${formatWindow(peak.start, peak.end)} \u00b7 ${t("dock.peakActive")}`] : [],
					`${t("dock.cacheHit")} ${formatTokens(snapshot.tokens.cacheHitTokens)} \u00b7 ${symbol}${formatCost(snapshot.costs.cacheHitCost)}`,
					`${t("dock.cacheMiss")} ${formatTokens(snapshot.tokens.cacheMissTokens)} \u00b7 ${symbol}${formatCost(snapshot.costs.cacheMissCost)}`,
					`${t("dock.output")} ${formatTokens(snapshot.tokens.outputTokens)} \u00b7 ${symbol}${formatCost(snapshot.costs.outputCost)}`
				].join(" · "),
				side: "top",
				delayMs: 500,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CostDock_module_css_default.root,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("dock.estimate") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: CostDock_module_css_default.value,
							children: [
								"~",
								symbol,
								formatCost(snapshot.costs.totalCost)
							]
						}),
						peak !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CostDock_module_css_default.peak,
							children: t("dock.peak")
						})
					]
				})
			});
		}
		//#endregion
		//#region \0dsh-css:./src/client/CostSettingsSection.module.css.mjs
		const css = ".ilN6fW_group{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:8px;padding:16px 0;display:flex}.ilN6fW_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}.ilN6fW_hint{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.ilN6fW_currencyRow{align-items:center;gap:8px;margin-top:4px;font-size:13px;line-height:20px;display:flex}.ilN6fW_fieldLabel{color:var(--dsw-alias-label-secondary);flex:0 0 110px}.ilN6fW_select{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);min-width:140px;height:30px;font:inherit;color:var(--dsw-alias-label-primary);background:0 0;border-radius:8px;padding:0 8px;font-size:13px;line-height:20px}.ilN6fW_block{flex-direction:column;gap:6px;margin-top:8px;display:flex}.ilN6fW_blockTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}.ilN6fW_blockHint{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.ilN6fW_tierRow{flex-wrap:wrap;align-items:center;gap:12px;display:flex}.ilN6fW_modelRow{flex-wrap:wrap;align-items:center;gap:12px;padding:4px 0;display:flex}.ilN6fW_nameInput{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:200px;height:30px;font:inherit;color:var(--dsw-alias-label-primary);background:0 0;border-radius:8px;padding:0 8px;font-size:13px;line-height:20px}.ilN6fW_priceCell{align-items:center;gap:6px;display:flex}.ilN6fW_priceLabel{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.ilN6fW_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:90px;height:30px;font:inherit;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;background:0 0;border-radius:8px;padding:0 8px;font-size:13px;line-height:20px}.ilN6fW_unit{color:var(--dsw-alias-label-caption);flex:none;font-size:13px;line-height:20px}.ilN6fW_addButton{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:8px;align-self:flex-start;padding:5px 14px;font-size:13px;line-height:20px}.ilN6fW_addButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.ilN6fW_removeButton{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:8px;padding:3px 10px;font-size:12px;line-height:18px}.ilN6fW_removeButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-error-primary)}.ilN6fW_actions{flex-wrap:wrap;align-items:center;gap:12px;margin-top:8px;display:flex}.ilN6fW_button{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:8px;padding:5px 14px;font-size:13px;line-height:20px}.ilN6fW_button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.ilN6fW_button:disabled,.ilN6fW_select:disabled,.ilN6fW_input:disabled,.ilN6fW_nameInput:disabled,.ilN6fW_timeInput:disabled,.ilN6fW_addButton:disabled,.ilN6fW_removeButton:disabled{opacity:.6;cursor:default}.ilN6fW_select:focus-visible,.ilN6fW_input:focus-visible,.ilN6fW_nameInput:focus-visible,.ilN6fW_timeInput:focus-visible,.ilN6fW_button:focus-visible,.ilN6fW_addButton:focus-visible,.ilN6fW_removeButton:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}.ilN6fW_statusOk{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.ilN6fW_statusError{color:var(--dsw-alias-color-danger,var(--dsw-alias-label-primary));font-size:13px;line-height:20px}.ilN6fW_modelBlock{flex-direction:column;gap:8px;padding:4px 0 10px;display:flex}.ilN6fW_modelBlock+.ilN6fW_modelBlock{border-top:1px dashed var(--dsw-alias-border-l2)}.ilN6fW_priceGroupLabel{color:var(--dsw-alias-label-caption);flex:none;font-size:13px;line-height:20px}.ilN6fW_toggleRow{color:var(--dsw-alias-label-secondary);align-items:center;gap:8px;font-size:13px;line-height:20px;display:flex}.ilN6fW_toggleRow input{accent-color:var(--dsw-alias-label-primary);margin:0}.ilN6fW_peakBlock{border-left:2px solid var(--dsw-alias-border-l2);flex-direction:column;gap:8px;padding:8px 0 0 12px;display:flex}.ilN6fW_peakWindowRow{flex-wrap:wrap;align-items:center;gap:12px;display:flex}.ilN6fW_timeCell{align-items:center;gap:6px;display:flex}.ilN6fW_timeInput{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:110px;height:30px;font:inherit;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;background:0 0;border-radius:8px;padding:0 8px;font-size:13px;line-height:20px}";
		const tagId = "dsh-cost-meter/CostSettingsSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-cost-meter";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var CostSettingsSection_module_css_default = {
			"actions": "ilN6fW_actions",
			"timeInput": "ilN6fW_timeInput",
			"blockHint": "ilN6fW_blockHint",
			"unit": "ilN6fW_unit",
			"removeButton": "ilN6fW_removeButton",
			"blockTitle": "ilN6fW_blockTitle",
			"peakBlock": "ilN6fW_peakBlock",
			"group": "ilN6fW_group",
			"block": "ilN6fW_block",
			"title": "ilN6fW_title",
			"hint": "ilN6fW_hint",
			"toggleRow": "ilN6fW_toggleRow",
			"modelRow": "ilN6fW_modelRow",
			"tierRow": "ilN6fW_tierRow",
			"fieldLabel": "ilN6fW_fieldLabel",
			"priceCell": "ilN6fW_priceCell",
			"currencyRow": "ilN6fW_currencyRow",
			"button": "ilN6fW_button",
			"input": "ilN6fW_input",
			"priceGroupLabel": "ilN6fW_priceGroupLabel",
			"modelBlock": "ilN6fW_modelBlock",
			"addButton": "ilN6fW_addButton",
			"peakWindowRow": "ilN6fW_peakWindowRow",
			"timeCell": "ilN6fW_timeCell",
			"statusError": "ilN6fW_statusError",
			"priceLabel": "ilN6fW_priceLabel",
			"select": "ilN6fW_select",
			"nameInput": "ilN6fW_nameInput",
			"statusOk": "ilN6fW_statusOk"
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
				className: CostSettingsSection_module_css_default.input,
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
				className: CostSettingsSection_module_css_default.timeInput,
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
				className: CostSettingsSection_module_css_default.priceCell,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CostSettingsSection_module_css_default.priceLabel,
					children: t(labelKey)
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
					value: tier[field],
					disabled,
					onChange: (v) => onChange(field, v)
				})]
			}, field)) });
		}
		/** One editable peak window row. */
		function PeakWindowRow(props) {
			const { window, disabled, t, onChange, onRemove } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CostSettingsSection_module_css_default.peakWindowRow,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: CostSettingsSection_module_css_default.timeCell,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CostSettingsSection_module_css_default.priceLabel,
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
						className: CostSettingsSection_module_css_default.timeCell,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CostSettingsSection_module_css_default.priceLabel,
							children: t("models.peakEnd")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TimeField, {
							value: window.end,
							disabled,
							onChange: (v) => onChange(window.uid, (w) => {
								w.end = v;
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CostSettingsSection_module_css_default.priceGroupLabel,
						children: t("models.peakPrices")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PriceCells, {
						tier: window,
						disabled,
						t,
						onChange: (field, value) => onChange(window.uid, (w) => {
							w[field] = value;
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: CostSettingsSection_module_css_default.removeButton,
						disabled,
						onClick: () => onRemove(window.uid),
						children: t("models.peakRemove")
					})
				]
			});
		}
		/** One editable per-model tier row plus its peak branch. */
		function ModelRow(props) {
			const { model, disabled, t, onChangeName, onChangePrice, onTogglePeak, onChangeWindow, onAddWindow, onRemoveWindow, onRemove } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CostSettingsSection_module_css_default.modelBlock,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CostSettingsSection_module_css_default.modelRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: CostSettingsSection_module_css_default.nameInput,
								type: "text",
								value: model.name,
								placeholder: t("models.namePlaceholder"),
								disabled,
								onChange: (e) => onChangeName(e.target.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: CostSettingsSection_module_css_default.priceGroupLabel,
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
								className: CostSettingsSection_module_css_default.removeButton,
								disabled,
								onClick: onRemove,
								children: t("models.remove")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: CostSettingsSection_module_css_default.toggleRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: model.peakEnabled,
							disabled,
							onChange: (e) => onTogglePeak(e.target.checked)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("models.peakToggle") })]
					}),
					model.peakEnabled && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CostSettingsSection_module_css_default.peakBlock,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CostSettingsSection_module_css_default.blockHint,
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
								className: CostSettingsSection_module_css_default.addButton,
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
				className: CostSettingsSection_module_css_default.group,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CostSettingsSection_module_css_default.title,
					children: t("title")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CostSettingsSection_module_css_default.hint,
					children: config === null ? t("loading") : t("loadFailed")
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CostSettingsSection_module_css_default.group,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CostSettingsSection_module_css_default.title,
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CostSettingsSection_module_css_default.hint,
						children: t("hint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CostSettingsSection_module_css_default.currencyRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CostSettingsSection_module_css_default.fieldLabel,
							children: t("currency")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							className: CostSettingsSection_module_css_default.select,
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
						className: CostSettingsSection_module_css_default.block,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CostSettingsSection_module_css_default.blockTitle,
								children: t("default.title")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CostSettingsSection_module_css_default.blockHint,
								children: t("default.hint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CostSettingsSection_module_css_default.tierRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PriceCells, {
									tier: draft.default,
									disabled,
									t,
									onChange: (field, value) => setDraftField((d) => {
										d.default[field] = value;
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CostSettingsSection_module_css_default.unit,
									children: t("prices.unit")
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CostSettingsSection_module_css_default.block,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CostSettingsSection_module_css_default.blockTitle,
								children: t("models.title")
							}),
							draft.models.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CostSettingsSection_module_css_default.blockHint,
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
								className: CostSettingsSection_module_css_default.addButton,
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
						className: CostSettingsSection_module_css_default.actions,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: CostSettingsSection_module_css_default.button,
								disabled: disabled || saveState.phase === "saving",
								onClick: onSave,
								children: saveState.phase === "saving" ? t("actions.saving") : t("actions.save")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: CostSettingsSection_module_css_default.button,
								disabled: disabled || saveState.phase === "saving",
								onClick: onReset,
								children: t("actions.reset")
							}),
							saveState.phase === "saved" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: CostSettingsSection_module_css_default.statusOk,
								role: "status",
								children: t("actions.saved")
							}),
							saveState.phase === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: CostSettingsSection_module_css_default.statusError,
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
			"models.peakHint": "每个时段均为本地时间，跨午夜请写为 22:00–06:00；多个时段重叠时按列表顺序取第一个。",
			"models.peakAdd": "添加峰值时段",
			"models.peakWindow": "峰值时段",
			"models.peakStart": "开始",
			"models.peakEnd": "结束",
			"models.peakPrices": "峰值价格",
			"models.peakRemove": "删除时段",
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
			"dock.model": "模型",
			"dock.fallback": "默认价格（未匹配模型）",
			"dock.cacheHit": "输入缓存命中",
			"dock.cacheMiss": "输入缓存未命中",
			"dock.output": "输出",
			"dock.peak": "峰值",
			"dock.peakWindow": "峰值时段",
			"dock.peakActive": "当前处于峰值时段",
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
			"models.peakHint": "Windows use local time; enter 22:00–06:00 for an overnight window. When windows overlap, the first match wins.",
			"models.peakAdd": "Add peak window",
			"models.peakWindow": "Peak window",
			"models.peakStart": "Start",
			"models.peakEnd": "End",
			"models.peakPrices": "Peak prices",
			"models.peakRemove": "Remove window",
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
			"dock.model": "Model",
			"dock.fallback": "Default price (no model matched)",
			"dock.cacheHit": "Input cache hit",
			"dock.cacheMiss": "Input cache miss",
			"dock.output": "Output",
			"dock.peak": "Peak",
			"dock.peakWindow": "Peak window",
			"dock.peakActive": "Currently in a peak window",
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
			const store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(null);
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