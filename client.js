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
		//#region src/client/pricing.ts
		/** Currency display symbols. */
		const CURRENCY_SYMBOLS = {
			CNY: "¥",
			USD: "$"
		};
		/** Sum the three disjoint prompt-side billing buckets (same rule as the stats line). */
		function billedInputTokens(usage) {
			return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
		}
		/**
		* Resolve the price tier for one model id: its table entry when present,
		* the `default` fallback otherwise.
		* @param config - the local price table.
		* @param model - provider-owned model id, or null/undefined when unknown.
		* @returns the applicable price tier.
		*/
		function resolveTier(config, model) {
			if (model !== null && model !== void 0) {
				const tier = config.models[model];
				if (tier !== void 0) return tier;
			}
			return config.default;
		}
		/**
		* Estimate the session cost from the durable provider usage and one price
		* tier. Cache reads bill at the cache-hit price; uncached input and cache
		* writes bill at the cache-miss price.
		* @param usage - the session's `tokenUsage` projection value.
		* @param tier - the price tier (per 1M tokens).
		* @returns the per-bucket and total cost.
		*/
		function estimateCost(usage, tier) {
			const cacheHitTokens = usage.cacheReadTokens;
			const cacheMissTokens = usage.uncachedInputTokens + usage.cacheWriteTokens;
			const outputTokens = usage.outputTokens;
			const cacheHitCost = cacheHitTokens * tier.cacheHitPrice / 1e6;
			const cacheMissCost = cacheMissTokens * tier.cacheMissPrice / 1e6;
			const outputCost = outputTokens * tier.outputPrice / 1e6;
			return {
				cacheHitTokens,
				cacheMissTokens,
				outputTokens,
				cacheHitCost,
				cacheMissCost,
				outputCost,
				totalCost: cacheHitCost + cacheMissCost + outputCost
			};
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
		const css$1 = ".qcz85a_root{box-sizing:border-box;width:100%;max-width:var(--dsh-chat-content-width);padding:2px calc(var(--dsh-composer-side-clearance) + 16px) 0;color:var(--dsw-alias-label-tertiary);white-space:nowrap;justify-content:center;align-items:baseline;gap:6px;margin:0 auto;font-size:12px;line-height:20px;display:flex;overflow:hidden}.qcz85a_value{font-variant-numeric:tabular-nums}";
		const tagId$1 = "dsh-cost-meter/CostDock.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-cost-meter";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var CostDock_module_css_default = {
			"root": "qcz85a_root",
			"value": "qcz85a_value"
		};
		//#endregion
		//#region src/client/CostDock.tsx
		/**
		* Cost readout appended to the chat stats line: one entry in
		* `conversation.composer.dock` right after the shipped stats entry (order 0),
		* fed by the durable `tokenUsage` projection, the session's current model, and
		* the per-model price table.
		*/
		/**
		* Render the estimated cost after the stats line. Renders nothing until the
		* provider has reported usage (the stats line gates its token groups the same
		* way) and the price table has loaded; the hover tooltip carries the priced
		* model and the per-bucket breakdown.
		* @param props - composed slot props.
		* @returns the cost line element tree, or null while there is nothing to show.
		*/
		function CostDock({ useProjection, useConfig, useModel, t }) {
			const usage = useProjection("tokenUsage");
			const config = useConfig();
			const model = useModel();
			if (usage === void 0) return null;
			if (config === null) return null;
			if (billedInputTokens(usage) === 0 && usage.outputTokens === 0) return null;
			const breakdown = estimateCost(usage, resolveTier(config, model));
			const symbol = CURRENCY_SYMBOLS[config.currency];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: [
					model !== null ? `${t("dock.model")} ${model}` : t("dock.fallback"),
					`${t("dock.cacheHit")} ${formatTokens(breakdown.cacheHitTokens)} \u00b7 ${symbol}${formatCost(breakdown.cacheHitCost)}`,
					`${t("dock.cacheMiss")} ${formatTokens(breakdown.cacheMissTokens)} \u00b7 ${symbol}${formatCost(breakdown.cacheMissCost)}`,
					`${t("dock.output")} ${formatTokens(breakdown.outputTokens)} \u00b7 ${symbol}${formatCost(breakdown.outputCost)}`
				].join(" · "),
				side: "top",
				delayMs: 500,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CostDock_module_css_default.root,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("dock.estimate") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: CostDock_module_css_default.value,
						children: [
							"~",
							symbol,
							formatCost(breakdown.totalCost)
						]
					})]
				})
			});
		}
		//#endregion
		//#region \0dsh-css:./src/client/CostSettingsSection.module.css.mjs
		const css = ".ilN6fW_group{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:8px;padding:16px 0;display:flex}.ilN6fW_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}.ilN6fW_hint{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.ilN6fW_currencyRow{align-items:center;gap:8px;margin-top:4px;font-size:13px;line-height:20px;display:flex}.ilN6fW_fieldLabel{color:var(--dsw-alias-label-secondary);flex:0 0 110px}.ilN6fW_select{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);min-width:140px;height:30px;font:inherit;color:var(--dsw-alias-label-primary);background:0 0;border-radius:8px;padding:0 8px;font-size:13px;line-height:20px}.ilN6fW_block{flex-direction:column;gap:6px;margin-top:8px;display:flex}.ilN6fW_blockTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}.ilN6fW_blockHint{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.ilN6fW_tierRow{flex-wrap:wrap;align-items:center;gap:12px;display:flex}.ilN6fW_modelRow{flex-wrap:wrap;align-items:center;gap:12px;padding:4px 0;display:flex}.ilN6fW_nameInput{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:200px;height:30px;font:inherit;color:var(--dsw-alias-label-primary);background:0 0;border-radius:8px;padding:0 8px;font-size:13px;line-height:20px}.ilN6fW_priceCell{align-items:center;gap:6px;display:flex}.ilN6fW_priceLabel{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.ilN6fW_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:90px;height:30px;font:inherit;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;background:0 0;border-radius:8px;padding:0 8px;font-size:13px;line-height:20px}.ilN6fW_unit{color:var(--dsw-alias-label-caption);flex:none;font-size:13px;line-height:20px}.ilN6fW_addButton{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:8px;align-self:flex-start;padding:5px 14px;font-size:13px;line-height:20px}.ilN6fW_addButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.ilN6fW_removeButton{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:8px;padding:3px 10px;font-size:12px;line-height:18px}.ilN6fW_removeButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-error-primary)}.ilN6fW_actions{flex-wrap:wrap;align-items:center;gap:12px;margin-top:8px;display:flex}.ilN6fW_button{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:8px;padding:5px 14px;font-size:13px;line-height:20px}.ilN6fW_button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.ilN6fW_button:disabled,.ilN6fW_select:disabled,.ilN6fW_input:disabled,.ilN6fW_nameInput:disabled,.ilN6fW_addButton:disabled,.ilN6fW_removeButton:disabled{opacity:.6;cursor:default}.ilN6fW_select:focus-visible,.ilN6fW_input:focus-visible,.ilN6fW_nameInput:focus-visible,.ilN6fW_button:focus-visible,.ilN6fW_addButton:focus-visible,.ilN6fW_removeButton:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}.ilN6fW_statusOk{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.ilN6fW_statusError{color:var(--dsw-alias-color-danger,var(--dsw-alias-label-primary));font-size:13px;line-height:20px}";
		const tagId = "dsh-cost-meter/CostSettingsSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-cost-meter";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var CostSettingsSection_module_css_default = {
			"unit": "ilN6fW_unit",
			"addButton": "ilN6fW_addButton",
			"blockTitle": "ilN6fW_blockTitle",
			"input": "ilN6fW_input",
			"button": "ilN6fW_button",
			"hint": "ilN6fW_hint",
			"statusOk": "ilN6fW_statusOk",
			"tierRow": "ilN6fW_tierRow",
			"priceLabel": "ilN6fW_priceLabel",
			"statusError": "ilN6fW_statusError",
			"nameInput": "ilN6fW_nameInput",
			"modelRow": "ilN6fW_modelRow",
			"currencyRow": "ilN6fW_currencyRow",
			"block": "ilN6fW_block",
			"group": "ilN6fW_group",
			"select": "ilN6fW_select",
			"removeButton": "ilN6fW_removeButton",
			"actions": "ilN6fW_actions",
			"priceCell": "ilN6fW_priceCell",
			"title": "ilN6fW_title",
			"fieldLabel": "ilN6fW_fieldLabel",
			"blockHint": "ilN6fW_blockHint"
		};
		//#endregion
		//#region src/client/CostSettingsSection.tsx
		/**
		* Settings page editing the per-model price table: currency, a `default`
		* fallback tier, and a list of per-model tiers. Renders as one Settings
		* section (`settings.section`); reads/writes through this plugin's host
		* routes via the injected save/reset face.
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
		/** Convert the persisted record to the editable array draft. */
		function toDraft(config) {
			return {
				currency: config.currency,
				default: { ...config.default },
				models: Object.entries(config.models).map(([name, tier]) => ({
					uid: nextUid++,
					name,
					tier: { ...tier }
				}))
			};
		}
		/** Convert the editable array draft back to the persisted record. */
		function fromDraft(draft) {
			const models = {};
			for (const model of draft.models) {
				const name = model.name.trim();
				if (name !== "") models[name] = model.tier;
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
		/** One editable per-model tier row. */
		function ModelRow(props) {
			const { model, disabled, t, onChangeName, onChangePrice, onRemove } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
					PRICE_FIELDS.map(({ field, labelKey }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: CostSettingsSection_module_css_default.priceCell,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CostSettingsSection_module_css_default.priceLabel,
							children: t(labelKey)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
							value: model.tier[field],
							disabled,
							onChange: (v) => onChangePrice(field, v)
						})]
					}, field)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: CostSettingsSection_module_css_default.removeButton,
						disabled,
						onClick: onRemove,
						children: t("models.remove")
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
							tier: { ...m.tier }
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
								children: [PRICE_FIELDS.map(({ field, labelKey }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: CostSettingsSection_module_css_default.priceCell,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: CostSettingsSection_module_css_default.priceLabel,
										children: t(labelKey)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
										value: draft.default[field],
										disabled,
										onChange: (v) => setDraftField((d) => {
											d.default[field] = v;
										})
									})]
								}, field)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
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
										tier: { ...d.default }
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
			"dock.output": "输出"
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
			"dock.output": "Output"
		};
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-cost-meter browser half:
		*
		* - `CostDock` — one entry in `conversation.composer.dock` (order 1, right
		*   after the shipped stats line at order 0) that appends the session's
		*   estimated cost, computed from the `tokenUsage` projection and the price
		*   tier for the session's current model (per-model, with a `default`
		*   fallback);
		* - `CostSettingsSection` — one Settings page (`settings.section`) editing the
		*   currency, the fallback tier, and the per-model price tiers.
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