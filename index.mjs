//#region dsh/vendor/cosmokit/src/misc.ts
/** Return true when a value is `null` or `undefined`. */
function isNullable(value) {
	return value === null || value === void 0;
}
/** Return true for non-array object values. */
function isPlainObject$2(data) {
	return data && typeof data === "object" && !Array.isArray(data);
}
/** Filter object entries and return a new object. */
function filterKeys(object, filter) {
	return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
/** Map object values while preserving the original key set. */
function mapValues(object, transform) {
	return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
/** Pick selected keys from an object, optionally including `undefined` values. */
function pick(source, keys, forced) {
	if (!keys) return { ...source };
	const result = {};
	for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
	return result;
}
//#endregion
//#region dsh/vendor/cosmokit/src/types.ts
/** Test values using `instanceof` with a `toStringTag` fallback. */
function is(type, value) {
	if (arguments.length === 1) return (value) => is(type, value);
	return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
	return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
	return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
let Binary;
(function(_Binary) {
	_Binary.is = isArrayBufferLike;
	_Binary.isSource = isArrayBufferSource;
	function fromSource(source) {
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		else return source;
	}
	_Binary.fromSource = fromSource;
	function toBase64(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
		let binary = "";
		const bytes = new Uint8Array(source);
		for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary);
	}
	_Binary.toBase64 = toBase64;
	function fromBase64(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
		return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
	}
	_Binary.fromBase64 = fromBase64;
	function toHex(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
		return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	_Binary.toHex = toHex;
	function fromHex(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
		const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
		const buffer = [];
		for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
		return Uint8Array.from(buffer).buffer;
	}
	_Binary.fromHex = fromHex;
})(Binary || (Binary = {}));
Binary.fromBase64;
Binary.toBase64;
Binary.fromHex;
Binary.toHex;
/** Deep-clone common JavaScript values while preserving prototypes and cycles. */
function clone(source, refs = /* @__PURE__ */ new Map()) {
	if (!source || typeof source !== "object") return source;
	if (is("Date", source)) return new Date(source.valueOf());
	if (is("RegExp", source)) return new RegExp(source.source, source.flags);
	if (isArrayBufferLike(source)) return source.slice(0);
	if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
	const cached = refs.get(source);
	if (cached) return cached;
	if (Array.isArray(source)) {
		const result = [];
		refs.set(source, result);
		source.forEach((value, index) => {
			result[index] = Reflect.apply(clone, null, [value, refs]);
		});
		return result;
	}
	const result = Object.create(Object.getPrototypeOf(source));
	refs.set(source, result);
	for (const key of Reflect.ownKeys(source)) {
		const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
		if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
		Reflect.defineProperty(result, key, descriptor);
	}
	return result;
}
/** Deeply compare arrays, dates, regexps, buffers, and plain object fields. */
function deepEqual(a, b, strict) {
	if (a === b) return true;
	if (!strict && isNullable(a) && isNullable(b)) return true;
	if (typeof a !== typeof b) return false;
	if (typeof a !== "object") return false;
	if (!a || !b) return false;
	function check(test, then) {
		return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
	}
	return check(Array.isArray, (a, b) => a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))) ?? check(is("Date"), (a, b) => a.valueOf() === b.valueOf()) ?? check(is("RegExp"), (a, b) => a.source === b.source && a.flags === b.flags) ?? check(isArrayBufferLike, (a, b) => {
		if (a.byteLength !== b.byteLength) return false;
		const viewA = new Uint8Array(a);
		const viewB = new Uint8Array(b);
		for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
		return true;
	}) ?? Object.keys({
		...a,
		...b
	}).every((key) => deepEqual(a[key], b[key], strict));
}
//#endregion
//#region dsh/vendor/cosmokit/src/time.ts
let Time;
(function(_Time) {
	_Time.millisecond = 1;
	const second = _Time.second = 1e3;
	const minute = _Time.minute = second * 60;
	const hour = _Time.hour = minute * 60;
	const day = _Time.day = hour * 24;
	const week = _Time.week = day * 7;
	let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
	function setTimezoneOffset(offset) {
		timezoneOffset = offset;
	}
	_Time.setTimezoneOffset = setTimezoneOffset;
	function getTimezoneOffset() {
		return timezoneOffset;
	}
	_Time.getTimezoneOffset = getTimezoneOffset;
	function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
		if (typeof date === "number") date = new Date(date);
		if (offset === void 0) offset = timezoneOffset;
		return Math.floor((date.valueOf() / minute - offset) / 1440);
	}
	_Time.getDateNumber = getDateNumber;
	function fromDateNumber(value, offset) {
		const date = new Date(value * day);
		if (offset === void 0) offset = timezoneOffset;
		return new Date(+date + offset * minute);
	}
	_Time.fromDateNumber = fromDateNumber;
	const numeric = /\d+(?:\.\d+)?/.source;
	const timeRegExp = new RegExp(`^${[
		"w(?:eek(?:s)?)?",
		"d(?:ay(?:s)?)?",
		"h(?:our(?:s)?)?",
		"m(?:in(?:ute)?(?:s)?)?",
		"s(?:ec(?:ond)?(?:s)?)?"
	].map((unit) => `(${numeric}${unit})?`).join("")}$`);
	function parseTime(source) {
		const capture = timeRegExp.exec(source);
		if (!capture) return 0;
		return (parseFloat(capture[1]) * week || 0) + (parseFloat(capture[2]) * day || 0) + (parseFloat(capture[3]) * hour || 0) + (parseFloat(capture[4]) * minute || 0) + (parseFloat(capture[5]) * second || 0);
	}
	_Time.parseTime = parseTime;
	function parseDate(date) {
		const parsed = parseTime(date);
		if (parsed) date = Date.now() + parsed;
		else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
		else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
		return date ? new Date(date) : /* @__PURE__ */ new Date();
	}
	_Time.parseDate = parseDate;
	function format(ms) {
		const abs = Math.abs(ms);
		if (abs >= day - hour / 2) return Math.round(ms / day) + "d";
		else if (abs >= hour - minute / 2) return Math.round(ms / hour) + "h";
		else if (abs >= minute - second / 2) return Math.round(ms / minute) + "m";
		else if (abs >= second) return Math.round(ms / second) + "s";
		return ms + "ms";
	}
	_Time.format = format;
	function toDigits(source, length = 2) {
		return source.toString().padStart(length, "0");
	}
	_Time.toDigits = toDigits;
	function template(template, time = /* @__PURE__ */ new Date()) {
		return template.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
	}
	_Time.template = template;
})(Time || (Time = {}));
//#endregion
//#region dsh/vendor/schemastery/src/index.ts
const kSchema = Symbol.for("schemastery");
const kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
	options;
	name = "ValidationError";
	constructor(message, options) {
		let prefix = "$";
		for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
		else if (typeof segment === "number") prefix += "[" + segment + "]";
		else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
		if (prefix.startsWith(".")) prefix = prefix.slice(1);
		super((prefix === "$" ? "" : `${prefix} `) + message);
		this.options = options;
	}
	static is(error) {
		return !!error?.[kValidationError];
	}
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
const Schema = function(options) {
	const schema = function(data, options = {}) {
		return Schema.resolve(data, schema, options)[0];
	};
	if (options.refs) {
		const refs = mapValues(options.refs, (options) => new Schema(options));
		const getRef = (uid) => refs[uid];
		for (const key in refs) {
			const options = refs[key];
			options.sKey = getRef(options.sKey);
			options.inner = getRef(options.inner);
			options.list = options.list && options.list.map(getRef);
			options.dict = options.dict && mapValues(options.dict, getRef);
		}
		return refs[options.uid];
	}
	Object.assign(schema, options);
	if (typeof schema.callback === "string") try {
		schema.callback = new Function("return " + schema.callback)();
	} catch {}
	Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
	Object.setPrototypeOf(schema, Schema.prototype);
	schema.meta ||= {};
	schema.toString = schema.toString.bind(schema);
	return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
	return {
		version: 1,
		vendor: "schemastery",
		validate: (value) => {
			try {
				return { value: Schema.resolve(value, this, {})[0] };
			} catch (error) {
				if (ValidationError.is(error)) return { issues: [{
					message: error.message,
					path: error.options.path
				}] };
				throw error;
			}
		}
	};
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
	if (globalThis.__schemastery_refs__) {
		globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
		return this.uid;
	}
	globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
	globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
	const result = {
		uid: this.uid,
		refs: globalThis.__schemastery_refs__
	};
	globalThis.__schemastery_refs__ = void 0;
	return result;
};
Schema.prototype.set = function set(key, value) {
	this.dict[key] = value;
	return this;
};
Schema.prototype.push = function push(value) {
	this.list.push(value);
	return this;
};
function mergeDesc(original, messages) {
	const result = typeof original === "string" ? { "": original } : { ...original };
	for (const locale in messages) {
		const value = messages[locale];
		if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
		else if (typeof value === "string") result[locale] = value;
	}
	return result;
}
function getInner(value) {
	return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
	return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
	const schema = Schema(this);
	const desc = mergeDesc(schema.meta.description, messages);
	if (Object.keys(desc).length) schema.meta.description = desc;
	if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
		return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
	});
	if (schema.list) schema.list = schema.list.map((inner, index) => {
		return inner.i18n(mapValues(messages, (data = {}) => {
			if (Array.isArray(getInner(data))) return getInner(data)[index];
			if (Array.isArray(data)) return data[index];
			return extractKeys(data);
		}));
	});
	if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
		if (getInner(data)) return getInner(data);
		return extractKeys(data);
	}));
	if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
	return schema;
};
Schema.prototype.extra = function extra(key, value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
};
for (const key of [
	"required",
	"disabled",
	"collapse",
	"hidden",
	"loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.deprecated = function deprecated() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "deprecated",
		type: "danger"
	});
	return schema;
};
Schema.prototype.experimental = function experimental() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "experimental",
		type: "warning"
	});
	return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
	const schema = Schema(this);
	const pattern = pick(regexp, ["source", "flags"]);
	schema.meta = {
		...schema.meta,
		pattern
	};
	return schema;
};
Schema.prototype.simplify = function simplify(value) {
	if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
	if (isNullable(value)) return value;
	if (this.type === "object" || this.type === "dict") {
		const result = {};
		for (const key in value) {
			const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
			if (this.type === "dict" || !isNullable(item)) result[key] = item;
		}
		if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
		return result;
	} else if (this.type === "array" || this.type === "tuple") {
		const result = [];
		value.forEach((value, index) => {
			const schema = this.type === "array" ? this.inner : this.list[index];
			const item = schema ? schema.simplify(value) : value;
			result.push(item);
		});
		return result;
	} else if (this.type === "intersect") {
		const result = {};
		for (const item of this.list) Object.assign(result, item.simplify(value));
		return result;
	} else if (this.type === "union") for (const schema of this.list) try {
		Schema.resolve(value, schema, {});
		return schema.simplify(value);
	} catch {}
	return value;
};
Schema.prototype.toString = function toString(inline) {
	return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		role,
		extra
	};
	return schema;
};
for (const key of [
	"default",
	"link",
	"comment",
	"description",
	"max",
	"min",
	"step"
]) Object.assign(Schema.prototype, { [key](value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
const resolvers = {};
Schema.extend = function extend(type, resolve) {
	resolvers[type] = resolve;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
	if (!schema) return [data];
	if (options.ignore?.(data, schema)) return [data];
	if (isNullable(data) && schema.type !== "lazy") {
		if (schema.meta.required) throw new ValidationError(`missing required value`, options);
		let current = schema;
		let fallback = schema.meta.default;
		while (current?.type === "intersect" && isNullable(fallback)) {
			current = current.list[0];
			fallback = current?.meta.default;
		}
		if (isNullable(fallback)) return [data];
		data = clone(fallback);
	}
	const callback = resolvers[schema.type];
	if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
	try {
		return callback(data, schema, options, strict);
	} catch (error) {
		if (!schema.meta.loose) throw error;
		return [schema.meta.default];
	}
};
Schema.from = function from(source) {
	if (isNullable(source)) return Schema.any();
	else if ([
		"string",
		"number",
		"boolean"
	].includes(typeof source)) return Schema.const(source).required();
	else if (source[kSchema]) return source;
	else if (typeof source === "function") switch (source) {
		case String: return Schema.string().required();
		case Number: return Schema.number().required();
		case Boolean: return Schema.boolean().required();
		case Function: return Schema.function().required();
		default: return Schema.is(source).required();
	}
	else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
	const toJSON = () => {
		if (!schema.inner[kSchema]) {
			schema.inner = schema.builder();
			schema.inner.meta = {
				...schema.meta,
				...schema.inner.meta
			};
		}
		return schema.inner.toJSON();
	};
	const schema = new Schema({
		type: "lazy",
		builder,
		inner: { toJSON }
	});
	return schema;
};
Schema.natural = function natural() {
	return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
	return Schema.number().step(.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
	return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
		const date = new Date(value);
		if (isNaN(+date)) throw new ValidationError(`invalid date "${value}"`, options);
		return date;
	}, true)]);
};
Schema.regExp = function regExp(flag = "") {
	return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
		try {
			return new RegExp(value, flag);
		} catch (e) {
			throw new ValidationError(e.message, options);
		}
	}, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
	return Schema.union([
		Schema.is(ArrayBuffer),
		Schema.is(SharedArrayBuffer),
		Schema.transform(Schema.any(), (value, options) => {
			if (Binary.isSource(value)) return Binary.fromSource(value);
			throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
		}, true),
		...encoding ? [Schema.transform(Schema.string(), (value, options) => {
			try {
				return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
			} catch (e) {
				throw new ValidationError(e.message, options);
			}
		}, true)] : []
	]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
	if (!schema.inner[kSchema]) {
		schema.inner = schema.builder();
		schema.inner.meta = {
			...schema.meta,
			...schema.inner.meta
		};
	}
	return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
	return [data];
});
Schema.extend("never", (data, _, options) => {
	throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
	if (deepEqual(data, value)) return [value];
	throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
	const { max = Infinity, min = -Infinity } = meta;
	if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
	if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
	if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
	if (meta.pattern) {
		const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
		if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
	}
	checkWithinRange(data.length, meta, "string length", options);
	return [data];
});
function decimalShift(data, digits) {
	const str = data.toString();
	if (str.includes("e")) return data * Math.pow(10, digits);
	const index = str.indexOf(".");
	if (index === -1) return data * Math.pow(10, digits);
	const frac = str.slice(index + 1);
	const integer = str.slice(0, index);
	if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
	return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
	step = Math.abs(step);
	if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
	const index = step.toString().indexOf(".");
	const digits = step.toString().slice(index + 1).length;
	return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
	if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
	checkWithinRange(data, meta, "number", options);
	const { step } = meta;
	if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
	return [data];
});
Schema.extend("boolean", (data, _, options) => {
	if (typeof data === "boolean") return [data];
	throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
	let value = 0, keys = [];
	if (typeof data === "number") {
		value = data;
		for (const key in bits) if (data & bits[key]) keys.push(key);
	} else if (Array.isArray(data)) {
		keys = data;
		for (const key of keys) {
			if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
			if (key in bits) value |= bits[key];
		}
	} else throw new ValidationError(`expected number or array but got ${data}`, options);
	if (value === meta.default) return [value];
	return [value, keys];
});
Schema.extend("function", (data, _, options) => {
	if (typeof data === "function") return [data];
	throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
	if (typeof constructor === "function") {
		if (data instanceof constructor) return [data];
		throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
	} else {
		if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
		let prototype = Object.getPrototypeOf(data);
		while (prototype) {
			if (prototype.constructor?.name === constructor) return [data];
			prototype = Object.getPrototypeOf(prototype);
		}
		throw new ValidationError(`expected ${constructor} but got ${data}`, options);
	}
});
function property(data, key, schema, options) {
	try {
		const [value, adapted] = Schema.resolve(data[key], schema, {
			...options,
			path: [...options.path || [], key]
		});
		if (adapted !== void 0) data[key] = adapted;
		return value;
	} catch (e) {
		if (!options?.autofix) throw e;
		delete data[key];
		return schema.meta.default;
	}
}
Schema.extend("array", (data, { inner, meta }, options) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
	return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
	if (!isPlainObject$2(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in data) {
		let rKey;
		try {
			rKey = Schema.resolve(key, sKey, options)[0];
		} catch (error) {
			if (strict) continue;
			throw error;
		}
		result[rKey] = property(data, key, inner, options);
		data[rKey] = data[key];
		if (key !== rKey) delete data[key];
	}
	return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	const result = list.map((inner, index) => property(data, index, inner, options));
	if (strict) return [result];
	result.push(...data.slice(list.length));
	return [result];
});
function merge(result, data) {
	for (const key in data) {
		if (key in result) continue;
		result[key] = data[key];
	}
}
Schema.extend("object", (data, { dict }, options, strict) => {
	if (!isPlainObject$2(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in dict) {
		const value = property(data, key, dict[key], options);
		if (!isNullable(value) || key in data) result[key] = value;
	}
	if (!strict) merge(result, data);
	return [result];
});
Schema.extend("union", (data, { list, toString }, options, strict) => {
	const messages = [];
	for (const inner of list) try {
		return Schema.resolve(data, inner, options, strict);
	} catch (error) {
		messages.push(error);
	}
	throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString }, options, strict) => {
	if (!list.length) return [data];
	let result;
	for (const inner of list) {
		const value = Schema.resolve(data, inner, options, true)[0];
		if (isNullable(value)) continue;
		if (isNullable(result)) result = value;
		else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
		else if (typeof value === "object") merge(result ??= {}, value);
		else if (result !== value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
	}
	if (!strict && isPlainObject$2(data)) merge(result, data);
	return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
	const [result, adapted = data] = Schema.resolve(data, inner, options, true);
	if (preserve) return [callback(result)];
	else return [callback(result), callback(adapted)];
});
const formatters = {};
function defineMethod(name, keys, format) {
	formatters[name] = format;
	Object.assign(Schema, { [name](...args) {
		const schema = new Schema({ type: name });
		keys.forEach((key, index) => {
			switch (key) {
				case "sKey":
					schema.sKey = args[index] ?? Schema.string();
					break;
				case "inner":
					schema.inner = Schema.from(args[index]);
					break;
				case "list":
					schema.list = args[index].map(Schema.from);
					break;
				case "dict":
					schema.dict = mapValues(args[index], Schema.from);
					break;
				case "bits":
					schema.bits = {};
					for (const key in args[index]) {
						if (typeof args[index][key] !== "number") continue;
						schema.bits[key] = args[index][key];
					}
					break;
				case "callback": {
					const callback = schema.callback = args[index];
					callback["toJSON"] ||= () => callback.toString();
					break;
				}
				case "constructor": {
					const constructor = schema.constructor = args[index];
					if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
					break;
				}
				default: schema[key] = args[index];
			}
		});
		if (name === "object" || name === "dict") schema.meta.default = {};
		else if (name === "array" || name === "tuple") schema.meta.default = [];
		else if (name === "bitset") schema.meta.default = 0;
		return schema;
	} });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
	if (typeof constructor === "function") return constructor.name;
	else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
	if (Object.keys(dict).length === 0) return "{}";
	return `{ ${Object.entries(dict).map(([key, inner]) => {
		return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
	}).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
	const result = list.map(({ toString: format }) => format()).join(" | ");
	return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
	return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
	"inner",
	"callback",
	"preserve"
], ({ inner }, isInner) => inner.toString(isInner));
//#endregion
//#region src/pricing.ts
/** Currency display symbols used by the browser half. */
const CURRENCY_SYMBOLS = {
	CNY: "¥",
	USD: "$"
};
/** ISO weekday numbers: 1 = Monday … 7 = Sunday. */
const WEEKDAYS = [
	1,
	2,
	3,
	4,
	5,
	6,
	7
];
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
* Estimate a cost from provider usage and one price tier. Cache reads bill
* at the cache-hit price; uncached input and cache writes bill at the
* cache-miss price.
* @param usage - one step's `tokenUsage` buckets.
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
//#endregion
//#region src/ledger.ts
/**
* Host-side cost ledger vocabulary and pure math. The ledger records one
* immutable price entry per model step billed after this plugin version was
* installed (no backfill). Each entry snapshots the token buckets, the model,
* the peak window (if any), the prices actually used, and the resulting cost.
*
* The storage-domain record schema is validated by a plain `parse` object so
* the host bundle stays self-contained (no zod import).
*/
const ENTRY_PREFIX = "t:";
/** Stable record key for one turn/step. */
function entryKey(turn, step) {
	return `${ENTRY_PREFIX}${turn}:${step}`;
}
/** Extract the provider usage carried by one committed event, if any. */
function usageSampleOf(event) {
	const data = event.data;
	if (data === null || data === void 0) return null;
	const usage = usageCarriedBy(event.type, data);
	if (usage === void 0) return null;
	const turn = Number(data.turn);
	const step = Number(data.step);
	const buckets = bucketsOf(usage);
	if (buckets === null || !Number.isSafeInteger(turn) || turn < 0 || !Number.isSafeInteger(step) || step < 0) return null;
	return {
		turn,
		step,
		buckets
	};
}
/**
* The provider usage one committed event carries, across the carriers the
* harness has used: a settlement's own `usage` field, the last `usage` chunk
* embedded in its compact stream, or (pre-V3 logs) a dedicated streaming event.
* @param type - committed event type.
* @param data - committed event payload.
* @returns the raw provider usage, or undefined when the event reports none.
*/
function usageCarriedBy(type, data) {
	if (type === "assistant/message" && data.usage !== void 0) return data.usage;
	if (type === "assistant/message" || type === "assistant/attempt") return lastStreamUsage(data.stream);
	if (type === "assistant/chunk") {
		const chunk = data.chunk;
		if (isPlainObject$1(chunk) && chunk.type === "usage") return chunk.usage;
	}
}
/** The last raw `usage` chunk of a compact Assistant stream, if it has one. */
function lastStreamUsage(stream) {
	if (!Array.isArray(stream)) return void 0;
	for (let index = stream.length - 1; index >= 0; index -= 1) {
		const record = stream[index];
		if (!isPlainObject$1(record) || record.type !== "chunk") continue;
		const chunk = record.chunk;
		if (isPlainObject$1(chunk) && chunk.type === "usage" && chunk.usage !== void 0) return chunk.usage;
	}
}
function bucketsOf(usage) {
	if (!isPlainObject$1(usage)) return null;
	const value = usage;
	const uncachedInputTokens = nonNegativeNumber(value.inputTokens);
	const outputTokens = nonNegativeNumber(value.outputTokens);
	const cacheReadTokens = nonNegativeNumber(value.cacheReadTokens ?? 0);
	const cacheWriteTokens = nonNegativeNumber(value.cacheWriteTokens ?? 0);
	if (uncachedInputTokens === null || outputTokens === null || cacheReadTokens === null || cacheWriteTokens === null) return null;
	return {
		uncachedInputTokens,
		outputTokens,
		cacheReadTokens,
		cacheWriteTokens
	};
}
/** The model id carried by a `request/header` event, if any. */
function modelOf(event) {
	if (event.type !== "request/header") return null;
	const model = event.data?.header?.config?.model;
	return typeof model === "string" && model !== "" ? model : null;
}
/**
* Read the committed events before `untilSeq` from whatever read API the live
* session exposes. The harness renamed this read once already (`events` array →
* `snapshotEvents`), and a missing property must never throw inside an event
* observer: an unknown session shape degrades to "no prior model".
* @param session - live session receiving the current event.
* @param untilSeq - exclusive upper bound: the sequence number of the event being folded.
* @returns committed events in log order, or an empty list when unreadable.
*/
function priorEventsOf(session, untilSeq) {
	if (typeof session.snapshotEvents === "function") try {
		const slice = session.snapshotEvents(0, untilSeq);
		if (Array.isArray(slice)) return slice;
	} catch {}
	if (Array.isArray(session.events)) return session.events;
	if (typeof session.eventAt === "function") {
		const collected = [];
		for (let seq = 0; seq < untilSeq; seq += 1) {
			const event = session.eventAt(seq);
			if (event === void 0) break;
			collected.push(event);
		}
		return collected;
	}
	return [];
}
/** Seed a fold from the committed prefix WITHOUT generating entries (no backfill). */
function seedFold(events, untilSeq) {
	let model = null;
	for (const event of events) {
		if (event.seq >= untilSeq) break;
		const next = modelOf(event);
		if (next !== null) model = next;
	}
	return { model };
}
/** Fold one new event's model state (no entry generation here). */
function foldModel(state, event) {
	const model = modelOf(event);
	return model === null || model === state.model ? state : { model };
}
/**
* Build the immutable cost entry for one usage sample at its own event time.
*/
function buildCostEntry(config, model, sample, time) {
	const { tier, peakWindow } = resolveTierAt(config, model, time);
	const breakdown = estimateCost(sample.buckets, tier);
	return {
		turn: sample.turn,
		step: sample.step,
		time,
		model,
		currency: config.currency,
		peakWindowId: peakWindow?.id ?? null,
		prices: {
			cacheHitPrice: tier.cacheHitPrice,
			cacheMissPrice: tier.cacheMissPrice,
			outputPrice: tier.outputPrice
		},
		tokens: {
			cacheHitTokens: breakdown.cacheHitTokens,
			cacheMissTokens: breakdown.cacheMissTokens,
			outputTokens: breakdown.outputTokens
		},
		costs: {
			cacheHitCost: breakdown.cacheHitCost,
			cacheMissCost: breakdown.cacheMissCost,
			outputCost: breakdown.outputCost,
			totalCost: breakdown.totalCost
		}
	};
}
/** True when two entries carry the same billed facts (avoids a no-op write). */
function sameEntry(left, right) {
	return left.turn === right.turn && left.step === right.step && left.time === right.time && left.model === right.model && left.currency === right.currency && left.peakWindowId === right.peakWindowId && left.prices.cacheHitPrice === right.prices.cacheHitPrice && left.prices.cacheMissPrice === right.prices.cacheMissPrice && left.prices.outputPrice === right.prices.outputPrice && left.tokens.cacheHitTokens === right.tokens.cacheHitTokens && left.tokens.cacheMissTokens === right.tokens.cacheMissTokens && left.tokens.outputTokens === right.tokens.outputTokens && left.costs.cacheHitCost === right.costs.cacheHitCost && left.costs.cacheMissCost === right.costs.cacheMissCost && left.costs.outputCost === right.costs.outputCost && left.costs.totalCost === right.costs.totalCost;
}
/** Replace (or insert) one step entry in a record; same reference when unchanged. */
function applyEntry(record, entry) {
	const key = entryKey(entry.turn, entry.step);
	const current = record.entries[key];
	if (current !== void 0 && sameEntry(current, entry)) return record;
	return {
		...record,
		entries: {
			...record.entries,
			[key]: entry
		}
	};
}
/** Read-side snapshot: sorted entries plus summed buckets and costs. */
function snapshotRecord(record) {
	const entries = Object.values(record?.entries ?? {}).sort((a, b) => a.time - b.time || a.turn - b.turn || a.step - b.step);
	const snapshot = {
		entries,
		tokens: {
			cacheHitTokens: 0,
			cacheMissTokens: 0,
			outputTokens: 0
		},
		costs: {
			cacheHitCost: 0,
			cacheMissCost: 0,
			outputCost: 0,
			totalCost: 0
		}
	};
	for (const entry of entries) {
		snapshot.tokens.cacheHitTokens += entry.tokens.cacheHitTokens;
		snapshot.tokens.cacheMissTokens += entry.tokens.cacheMissTokens;
		snapshot.tokens.outputTokens += entry.tokens.outputTokens;
		snapshot.costs.cacheHitCost += entry.costs.cacheHitCost;
		snapshot.costs.cacheMissCost += entry.costs.cacheMissCost;
		snapshot.costs.outputCost += entry.costs.outputCost;
		snapshot.costs.totalCost += entry.costs.totalCost;
	}
	return snapshot;
}
/**
* Structural domain spec accepted by `ctx.storageDomain.open`. The record
* `parse` validates stored rows by hand, so this package imports no zod.
*/
const LEDGER_DOMAIN_SPEC = {
	name: "dsh_cost_meter",
	version: 1,
	tables: { sessions: { valueSchema: { parse(raw) {
		return parseSessionCostRecord(raw);
	} } } }
};
function parseSessionCostRecord(raw) {
	if (!isPlainObject$1(raw)) throw new Error("cost-ledger session record must be an object");
	const value = raw;
	if (typeof value.sessionId !== "string" || value.sessionId === "") throw new Error("cost-ledger session record has no sessionId");
	if (!isPlainObject$1(value.entries)) throw new Error("cost-ledger session record entries must be an object");
	const entries = {};
	for (const [key, rawEntry] of Object.entries(value.entries)) entries[key] = parseCostEntry(rawEntry);
	return {
		sessionId: value.sessionId,
		entries
	};
}
function parseCostEntry(raw) {
	if (!isPlainObject$1(raw)) throw new Error("cost-ledger entry must be an object");
	const value = raw;
	const turn = nonNegativeInteger(value.turn, "turn");
	const step = nonNegativeInteger(value.step, "step");
	const time = finiteNumber(value.time, "time");
	if (time < 0) throw new Error("cost-ledger entry time must be non-negative");
	if (value.model !== null && typeof value.model !== "string") throw new Error("cost-ledger entry model must be a string or null");
	if (value.currency !== "CNY" && value.currency !== "USD") throw new Error("cost-ledger entry currency must be CNY or USD");
	if (value.peakWindowId !== null && typeof value.peakWindowId !== "string") throw new Error("cost-ledger entry peakWindowId must be a string or null");
	if (!isPlainObject$1(value.tokens)) throw new Error("cost-ledger entry tokens must be an object");
	const tokens = value.tokens;
	return {
		turn,
		step,
		time,
		model: value.model,
		currency: value.currency,
		peakWindowId: value.peakWindowId,
		prices: {
			cacheHitPrice: nonNegativePrice(value, "prices.cacheHitPrice"),
			cacheMissPrice: nonNegativePrice(value, "prices.cacheMissPrice"),
			outputPrice: nonNegativePrice(value, "prices.outputPrice")
		},
		tokens: {
			cacheHitTokens: nonNegativeInteger(tokens.cacheHitTokens, "tokens.cacheHitTokens"),
			cacheMissTokens: nonNegativeInteger(tokens.cacheMissTokens, "tokens.cacheMissTokens"),
			outputTokens: nonNegativeInteger(tokens.outputTokens, "tokens.outputTokens")
		},
		costs: {
			cacheHitCost: nonNegativePrice(value, "costs.cacheHitCost"),
			cacheMissCost: nonNegativePrice(value, "costs.cacheMissCost"),
			outputCost: nonNegativePrice(value, "costs.outputCost"),
			totalCost: nonNegativePrice(value, "costs.totalCost")
		}
	};
}
function isPlainObject$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonNegativeNumber(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function finiteNumber(value, field) {
	if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`cost-ledger ${field} must be a finite number`);
	return value;
}
function nonNegativeInteger(value, field) {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`cost-ledger ${field} must be a non-negative integer`);
	return value;
}
function nonNegativePrice(value, field) {
	const nested = field.split(".");
	let current = value;
	for (const key of nested) {
		if (!isPlainObject$1(current)) throw new Error(`cost-ledger ${field} must be a non-negative number`);
		current = current[key];
	}
	const parsed = nonNegativeNumber(current);
	if (parsed === null) throw new Error(`cost-ledger ${field} must be a non-negative number`);
	return parsed;
}
//#endregion
//#region src/ledger-runtime.ts
/**
* Runtime half of the per-session cost ledger. It owns the storage-domain
* sidecar table, listens to committed session events, and writes one immutable
* price entry per billed step (only steps committed after this plugin version
* is installed — no backfill). It also reconciles archived sessions and
* deletes their ledger records.
*/
/** Archive reconciliation interval. */
const ARCHIVE_RECONCILE_MS = 3e4;
/**
* The ledger runtime for one mounted plugin instance. Event observation is
* synchronous; every storage write is queued per session so read-modify-write
* updates of one session never interleave.
*/
var CostLedgerRuntime = class {
	ctx;
	readConfig;
	domain;
	table;
	ready;
	opened = false;
	closed = false;
	stopEvent;
	archiveTimer;
	folds = /* @__PURE__ */ new WeakMap();
	tails = /* @__PURE__ */ new Map();
	allTails = /* @__PURE__ */ new Set();
	/** Distinct observation failures already logged (one line per cause). */
	reportedFailures = /* @__PURE__ */ new Set();
	constructor(ctx, readConfig) {
		this.ctx = ctx;
		this.readConfig = readConfig;
	}
	/** Open the sidecar domain and start observing committed session events. */
	open() {
		if (this.opened) return;
		this.opened = true;
		this.ready = this.ctx.storageDomain.open(LEDGER_DOMAIN_SPEC).then((domain) => {
			if (this.closed) return domain.close().then(() => void 0);
			this.domain = domain;
			this.table = domain.table("sessions");
		}).catch((error) => {
			this.ctx.logger.warn(`dsh-cost-meter: cost ledger domain unavailable: ${String(error)}`);
			throw error;
		});
		this.stopEvent = this.ctx.on("session/event", (session, event) => {
			this.onEvent(session, event);
		});
		this.archiveTimer = setInterval(() => {
			this.reconcileArchived();
		}, ARCHIVE_RECONCILE_MS);
	}
	/** Stop observing, drain queued writes, and close the sidecar domain. */
	async dispose() {
		this.closed = true;
		this.stopEvent?.();
		this.stopEvent = void 0;
		if (this.archiveTimer !== void 0) clearInterval(this.archiveTimer);
		await this.ready?.catch(() => void 0);
		await Promise.allSettled([...this.allTails]);
		await this.domain?.close();
		this.domain = void 0;
		this.table = void 0;
	}
	/** Read one session's ledger, deleting the row first when the session is archived. */
	async read(sessionId) {
		if (this.table === void 0) try {
			await this.ready;
		} catch {
			return { kind: "unavailable" };
		}
		if (this.closed || this.table === void 0) return { kind: "unavailable" };
		if (this.isArchived(sessionId)) {
			await this.deleteSession(sessionId);
			return { kind: "archived" };
		}
		return {
			kind: "ready",
			snapshot: snapshotRecord(this.table.get(sessionId))
		};
	}
	/**
	* True when any durable entry was billed in a currency different from
	* `currency`. Used to refuse currency switches once billing has started:
	* immutable snapshots in two currencies cannot be summed meaningfully.
	*/
	async hasForeignEntries(currency) {
		if (this.closed) return false;
		if (this.table === void 0) try {
			await this.ready;
		} catch {
			return false;
		}
		if (this.closed || this.table === void 0) return false;
		for (const key of this.table.keys()) {
			const record = this.table.get(key);
			if (record === void 0) continue;
			for (const entry of Object.values(record.entries)) if (entry.currency !== currency) return true;
		}
		return false;
	}
	/** Delete ledger rows for every session currently in the archive set. */
	async reconcileArchived() {
		if (this.closed) return;
		if (this.table === void 0) try {
			await this.ready;
		} catch {
			return;
		}
		if (this.closed || this.table === void 0) return;
		const archived = this.ctx.get("workspaceRegistry")?.archivedSessionIds;
		if (archived === void 0 || archived.length === 0) return;
		const archivedSet = new Set(archived);
		const victims = [];
		for (const key of this.table.keys()) if (archivedSet.has(key)) victims.push(key);
		await Promise.all(victims.map((sessionId) => this.deleteSession(sessionId)));
	}
	onEvent(session, event) {
		if (this.closed) return;
		try {
			let state = this.folds.get(session);
			if (state === void 0) state = seedFold(priorEventsOf(session, event.seq), event.seq);
			const next = foldModel(state, event);
			if (next !== state) this.folds.set(session, next);
			const sample = usageSampleOf(event);
			if (sample === null) return;
			const config = this.readConfig();
			if (config === void 0) return;
			const entry = buildCostEntry(config, next.model, sample, event.time);
			this.enqueue(session.id, async () => {
				if (this.closed) return;
				try {
					await this.ready;
				} catch {
					return;
				}
				if (this.table === void 0) return;
				const current = this.table.get(session.id) ?? {
					sessionId: session.id,
					entries: {}
				};
				const updated = applyEntry(current, entry);
				if (updated !== current) await this.table.put(session.id, updated);
			});
		} catch (error) {
			this.reportObservationFailure(error);
		}
	}
	/** Log the first distinct observation failure; later repeats stay quiet. */
	reportObservationFailure(error) {
		const message = `dsh-cost-meter: cost observation failed: ${String(error)}`;
		if (this.reportedFailures.has(message)) return;
		this.reportedFailures.add(message);
		this.ctx.logger.warn(message);
	}
	/** Serialize one session's ledger mutations (per-session tail; the domain chain also serializes). */
	enqueue(sessionId, job) {
		const settled = (this.tails.get(sessionId) ?? Promise.resolve()).then(job, job).catch((error) => {
			this.ctx.logger.warn(`dsh-cost-meter: ledger write for "${sessionId}" failed: ${String(error)}`);
		});
		this.tails.set(sessionId, settled);
		this.allTails.add(settled);
		settled.finally(() => {
			if (this.tails.get(sessionId) === settled) this.tails.delete(sessionId);
			this.allTails.delete(settled);
		});
		return settled;
	}
	async deleteSession(sessionId) {
		await this.enqueue(sessionId, async () => {
			if (this.closed) return;
			try {
				await this.ready;
			} catch {
				return;
			}
			if (this.table !== void 0) await this.table.delete(sessionId);
		});
	}
	isArchived(sessionId) {
		return this.ctx.get("workspaceRegistry")?.archivedSessionIds.includes(sessionId) ?? false;
	}
};
//#endregion
//#region src/index.ts
/**
* dsh-cost-meter host half: the local per-model pricing table (with optional
* peak-time branches), the per-session cost ledger stored in a DSH
* storage-domain sidecar, and the same-origin routes the browser half reads.
*
* Prices are keyed by model id, with a `default` fallback tier; every value is
* per 1,000,000 tokens in one billing currency (CNY = ¥ / USD = $). The row's
* cordis config supplies the `base` layer of the settings namespace
* (`dsh-cost-meter`); the user's settings document layers over it, so price
* edits persist in `$DSH_HOME/settings.yaml` and hot-reload.
*
* Cost accounting is NOT a live projection: every billed step committed after
* this plugin version is installed is stored as an immutable entry (tokens,
* model, peak window, price snapshot, cost) in the `dsh-cost-meter` storage
* domain, keyed by session. The browser sums those entries; archiving a
* session deletes its row.
*
* The web api-proxy only exposes a hardcoded settings allowlist (product and
* model-provider namespaces) to the browser, so a third-party namespace is
* `settings-not-exposed` over `/api/settings`. This host half therefore owns
* its own same-origin routes (`/dsh-cost-meter/*`) for the browser half,
* reading and writing through the host `ctx.settings` scope directly.
*
* The host half is bundled self-contained (schemastery is inlined).
*
* @module dsh-cost-meter
*/
/** Stable Cordis plugin name. */
const name = "dsh-cost-meter";
/** Settings namespace owned by this plugin (host + browser halves agree on it). */
const SETTINGS_NAMESPACE = "dsh-cost-meter";
/** Accepted billing currencies (CNY = ¥, USD = $). */
const CURRENCIES = ["CNY", "USD"];
/** Local `HH:mm` window time. */
const TIME_SCHEMA = Schema.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);
/**
* Official DeepSeek peak spans in Beijing time: 09:00–12:00 and 14:00–18:00 on
* workdays. Off-peak is everything else, including weekends and holidays.
* Source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing
*/
const DEFAULT_PEAK_SPANS = [{
	id: "peak-morning",
	start: "09:00",
	end: "12:00"
}, {
	id: "peak-afternoon",
	start: "14:00",
	end: "18:00"
}];
/** Shipped off-peak prices in CNY per 1M tokens, from the official price table. */
const FLASH_OFF_PEAK = {
	cacheHitPrice: .02,
	cacheMissPrice: 1,
	outputPrice: 4
};
const PRO_OFF_PEAK = {
	cacheHitPrice: .15,
	cacheMissPrice: 4.5,
	outputPrice: 13.5
};
/**
* Build one shipped tier: the off-peak prices plus the official peak spans on
* Monday–Friday. The documented peak price is exactly twice the off-peak price,
* so the branches are derived rather than transcribed.
*/
function defaultTier(offPeak) {
	return {
		...offPeak,
		peakWindows: DEFAULT_PEAK_SPANS.map((span) => ({
			id: span.id,
			start: span.start,
			end: span.end,
			days: [...DEFAULT_PEAK_DAYS],
			cacheHitPrice: offPeak.cacheHitPrice * 2,
			cacheMissPrice: offPeak.cacheMissPrice * 2,
			outputPrice: offPeak.outputPrice * 2
		}))
	};
}
/**
* Shipped default pricing, in CNY per 1M tokens, matching the current official
* table (deepseek-flash and deepseek-v4-pro) with peak pricing enabled for the
* documented weekday windows. The `default` tier mirrors `deepseek-v4-pro`, and
* the two retired Flash ids are kept mapped to Flash prices because the official
* notes still bill them as Flash.
*/
const DEFAULT_COST_CONFIG = {
	currency: "CNY",
	default: defaultTier(PRO_OFF_PEAK),
	models: {
		"deepseek-flash": defaultTier(FLASH_OFF_PEAK),
		"deepseek-v4-pro": defaultTier(PRO_OFF_PEAK),
		"deepseek-v4-flash": defaultTier(FLASH_OFF_PEAK),
		"deepseek-v4-flash-vision-exp": defaultTier(FLASH_OFF_PEAK)
	}
};
/** One optional peak-time branch, editable per model. */
const PeakWindowSchema = Schema.object({
	id: Schema.string().pattern(/^[A-Za-z0-9._:-]+$/).required(),
	start: TIME_SCHEMA.required(),
	end: TIME_SCHEMA.required(),
	days: Schema.array(Schema.number().step(1).min(1).max(7)).default([...DEFAULT_PEAK_DAYS]).description("Weekdays (ISO 1 = Monday … 7 = Sunday) this window bills on; empty disables it."),
	cacheHitPrice: Schema.number().min(0).default(0),
	cacheMissPrice: Schema.number().min(0).default(0),
	outputPrice: Schema.number().min(0).default(0)
});
/** Per-model price tier schema (each price field defaults to 0 when absent). */
const PriceSchema = Schema.object({
	cacheHitPrice: Schema.number().min(0).default(0),
	cacheMissPrice: Schema.number().min(0).default(0),
	outputPrice: Schema.number().min(0).default(0),
	peakWindows: Schema.array(PeakWindowSchema).default([])
});
/**
* The price-table schema: the cordis Config (validated for the loader row)
* and the settings namespace schema (the wire envelope). The whole object
* resolves {@link DEFAULT_COST_CONFIG} for an absent row config.
*/
const Config = Schema.object({
	currency: Schema.union([...CURRENCIES]).default(DEFAULT_COST_CONFIG.currency).description("Billing currency: CNY (¥) or USD ($)."),
	default: PriceSchema.default(DEFAULT_COST_CONFIG.default),
	models: Schema.dict(PriceSchema).default(DEFAULT_COST_CONFIG.models)
}).default(DEFAULT_COST_CONFIG);
/** Services required before the routes can mount and the namespace register. */
const inject = ["webServer", "settings"];
/** Hard cap on the config write body. */
const MAX_BODY_BYTES = 64 * 1024;
/** Buffer and parse one JSON request body, capped to avoid unbounded reads. */
async function readJsonBody(req, cap) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.byteLength;
		if (size > cap) throw new Error("request body too large");
		chunks.push(buffer);
	}
	const raw = Buffer.concat(chunks).toString("utf8").trim();
	if (raw === "") return void 0;
	return JSON.parse(raw);
}
/** Send a JSON body with the standard content type. */
function sendJson(res, status, value) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(value));
}
/** Return true when a value is a plain object. */
function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* One-time migration from the earlier flat price table (`currency` plus three
* top-level prices) to the per-model shape. Folds the legacy prices into the
* `default` tier and drops the flat keys, preserving the user's values.
* @param scope - the registered settings scope.
*/
function migrateLegacySection(scope) {
	const value = scope.get();
	if (value === void 0) return;
	const { cacheHitPrice, cacheMissPrice, outputPrice } = value;
	if (cacheHitPrice === void 0 && cacheMissPrice === void 0 && outputPrice === void 0) return;
	scope.replace({
		currency: value.currency,
		default: {
			cacheHitPrice: cacheHitPrice ?? value.default.cacheHitPrice,
			cacheMissPrice: cacheMissPrice ?? value.default.cacheMissPrice,
			outputPrice: outputPrice ?? value.default.outputPrice
		}
	});
}
/**
* Register the settings namespace (persistence in settings.yaml), mount the
* optional storage-domain ledger child, and serve the browser-facing config
* and ledger routes.
* @param ctx - host context.
* @param config - validated cordis row config.
*/
function apply(ctx, config) {
	const scope = ctx.settings.register(SETTINGS_NAMESPACE, Config, { base: {
		currency: config.currency,
		default: config.default
	} });
	migrateLegacySection(scope);
	let ledgerRuntime;
	ctx.inject(["storageDomain"], (ledgerCtx) => {
		ledgerCtx.effect(() => {
			const runtime = new CostLedgerRuntime(ledgerCtx, () => scope.get());
			ledgerRuntime = runtime;
			runtime.open();
			return () => {
				if (ledgerRuntime === runtime) ledgerRuntime = void 0;
				return runtime.dispose();
			};
		}, "dsh-cost-meter: cost ledger");
	});
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/dsh-cost-meter",
		handler: (req, res) => {
			const url = req.url ?? "";
			if (req.method === "GET" && (url === "/dsh-cost-meter/config" || url === "/dsh-cost-meter/config/")) {
				sendJson(res, 200, {
					ok: true,
					value: scope.get()
				});
				return;
			}
			if (req.method === "POST" && (url === "/dsh-cost-meter/config" || url === "/dsh-cost-meter/config/")) {
				(async () => {
					try {
						const body = await readJsonBody(req, MAX_BODY_BYTES);
						if (!isPlainObject(body)) throw new Error("a JSON object body is required");
						const current = scope.get();
						const requestedCurrency = body.currency;
						const nextCurrency = requestedCurrency === "CNY" || requestedCurrency === "USD" ? requestedCurrency : DEFAULT_COST_CONFIG.currency;
						if (current !== void 0 && nextCurrency !== current.currency && ledgerRuntime !== void 0 && await ledgerRuntime.hasForeignEntries(nextCurrency)) throw new Error(`cannot change currency: existing cost entries were billed in ${current.currency}`);
						await scope.replace(body);
						sendJson(res, 200, {
							ok: true,
							value: scope.get()
						});
					} catch (error) {
						sendJson(res, 400, {
							ok: false,
							error: error instanceof Error ? error.message : String(error)
						});
					}
				})();
				return;
			}
			if (req.method === "POST" && (url === "/dsh-cost-meter/reset" || url === "/dsh-cost-meter/reset/")) {
				(async () => {
					try {
						await scope.replace({});
						sendJson(res, 200, {
							ok: true,
							value: scope.get()
						});
					} catch (error) {
						sendJson(res, 400, {
							ok: false,
							error: error instanceof Error ? error.message : String(error)
						});
					}
				})();
				return;
			}
			const ledgerMatch = /^\/dsh-cost-meter\/sessions\/([^/]+)\/ledger\/?$/.exec(url);
			if (req.method === "GET" && ledgerMatch !== null) {
				(async () => {
					try {
						let sessionId;
						try {
							sessionId = decodeURIComponent(ledgerMatch[1]);
						} catch {
							throw new Error("invalid session id encoding");
						}
						if (sessionId === "" || sessionId.includes("/") || sessionId.includes("\\")) throw new Error("invalid session id");
						if (ledgerRuntime === void 0) {
							sendJson(res, 503, {
								ok: false,
								error: "cost ledger is unavailable in this assembly"
							});
							return;
						}
						const result = await ledgerRuntime.read(sessionId);
						if (result.kind === "unavailable") sendJson(res, 503, {
							ok: false,
							error: "cost ledger is unavailable"
						});
						else if (result.kind === "archived") sendJson(res, 200, {
							ok: true,
							sessionId,
							archived: true,
							value: null
						});
						else sendJson(res, 200, {
							ok: true,
							sessionId,
							value: result.snapshot
						});
					} catch (error) {
						sendJson(res, 400, {
							ok: false,
							error: error instanceof Error ? error.message : String(error)
						});
					}
				})();
				return;
			}
			res.writeHead(404);
			res.end();
		}
	}), "dsh-cost-meter: config routes");
}
//#endregion
export { CURRENCIES, CURRENCY_SYMBOLS, Config, DEFAULT_COST_CONFIG, DEFAULT_PEAK_DAYS, SETTINGS_NAMESPACE, WEEKDAYS, apply, inject, name };
