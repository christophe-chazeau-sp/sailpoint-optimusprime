import { lookupOperation } from '../catalog/operations';
import { JsonPath } from '../model/transform-graph';
import { pathKey } from '../source-range';
import { applyDateMath, DateError, formatDate, javaIsoString, parseDate, parseIso } from './dates';
import { javaSplit, renderTemplate, TemplateError, TemplateValue, TemplateVars } from './velocity';

export type Value = string | number | boolean | null;

/** A variable declared on a conditional, after it has been evaluated. */
export interface DeclaredVariable {
  name: string;
  value: Value;
}

export type StepResult =
  | { ok: true; value: Value; variables?: DeclaredVariable[] }
  | { ok: false; error: string; upstream?: boolean; variables?: DeclaredVariable[] };

export interface EvaluationInputs {
  /** Value of the source attribute the transform is mapped to; null when absent. */
  implicitInput: string | null;
  /** Keyed by {@link accountKey}. */
  accountAttributes: Record<string, string | null>;
  /** Keyed by identity attribute name. */
  identityAttributes: Record<string, string | null>;
  now?: Date;
}

export interface Evaluation {
  result: StepResult;
  /** Keyed by {@link pathKey} of each transform or literal in the document. */
  steps: Map<string, StepResult>;
  /** Keyed by {@link pathKey} of a step: the {@link inputKey} of the input it picked. */
  choices: Map<string, string>;
}

/** Names one input of a step: `values[1]`, `table › Engineering`, or a plain attribute key. */
export function inputKey(attribute: string, part?: string | number): string {
  if (part === undefined) return attribute;
  return typeof part === 'number' ? `${attribute}[${part}]` : `${attribute} › ${part}`;
}

export type RequiredInputKind = 'implicit' | 'account' | 'identity';

export interface RequiredInput {
  key: string;
  kind: RequiredInputKind;
  label: string;
  detail: string;
}

export const IMPLICIT_KEY = 'implicit';

export function accountKey(sourceName: string, attributeName: string): string {
  return `${sourceName} › ${attributeName}`;
}

/** The values a user must supply to run the transform: implicit input and attribute lookups. */
export function requiredInputs(document: unknown): RequiredInput[] {
  const found = new Map<string, RequiredInput>();
  const seen = new WeakSet<object>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value) || seen.has(value)) {
      return;
    }
    seen.add(value);
    if (typeof value['type'] === 'string') {
      const type = value['type'];
      const attributes = isRecord(value['attributes']) ? value['attributes'] : {};
      if (lookupOperation(type)?.consumesInput && !('input' in attributes) && !nowDateMath(type, attributes)) {
        found.set(IMPLICIT_KEY, {
          key: IMPLICIT_KEY,
          kind: 'implicit',
          label: 'Implicit input',
          detail: 'Value of the source attribute this transform is mapped to',
        });
      }
      if (type === 'accountAttribute') {
        const source = String(attributes['sourceName'] ?? attributes['applicationName'] ?? '');
        const attribute = String(attributes['attributeName'] ?? '');
        const key = accountKey(source, attribute);
        found.set(`account:${key}`, { key, kind: 'account', label: attribute, detail: `Account on ${source}` });
      }
      if (type === 'identityAttribute') {
        const name = String(attributes['name'] ?? '');
        found.set(`identity:${name}`, { key: name, kind: 'identity', label: name, detail: 'Identity attribute' });
      }
      if (type === 'displayName') {
        for (const name of ['preferredName', 'firstname', 'lastname']) {
          found.set(`identity:${name}`, { key: name, kind: 'identity', label: name, detail: 'Identity attribute' });
        }
      }
      visit(attributes);
      return;
    }
    Object.values(value).forEach(visit);
  };

  visit(document);
  const order: RequiredInputKind[] = ['implicit', 'account', 'identity'];
  return [...found.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

export function evaluateTransform(document: unknown, inputs: EvaluationInputs): Evaluation {
  const evaluator = new Evaluator(inputs);
  let result: StepResult;
  try {
    evaluator.run(document as Record<string, unknown>, []);
    result = evaluator.steps.get(pathKey([]) as string) ?? { ok: true, value: null };
  } catch (error) {
    result = evaluator.steps.get(pathKey([]) as string) ?? { ok: false, error: describe(error) };
  }
  return { result, steps: evaluator.steps, choices: evaluator.choices };
}

export interface StepInput {
  key: string;
  /** Where the value comes from: an operation label, "Implicit input" or "Literal". */
  source: string;
  /** Absent when the step stopped before it needed this input. */
  result?: StepResult;
  chosen: boolean;
}

/** Every value the step at `path` reads, resolved against a finished evaluation. */
export function stepInputs(
  document: unknown,
  path: JsonPath,
  evaluation: Evaluation,
  implicitInput: string | null,
): StepInput[] {
  const node = valueAt(document, path);
  if (!isRecord(node) || typeof node['type'] !== 'string') {
    return [];
  }
  const type = node['type'];
  const attributes = isRecord(node['attributes']) ? node['attributes'] : {};
  const chosen = evaluation.choices.get(pathKey(path) as string);
  const rows: StepInput[] = [];

  const add = (key: string, raw: unknown, rawPath: JsonPath) => {
    const row = isRecord(raw) && typeof raw['type'] === 'string'
      ? {
          key,
          source: lookupOperation(raw['type'])?.label ?? raw['type'],
          result: evaluation.steps.get(pathKey(rawPath) as string),
        }
      : {
          key,
          source: 'Literal',
          result: evaluation.steps.get(pathKey(rawPath) as string) ?? { ok: true, value: toValue(raw) },
        };
    rows.push({ ...row, chosen: row.key === chosen });
  };

  if (lookupOperation(type)?.consumesInput && !('input' in attributes) && !nowDateMath(type, attributes)) {
    rows.push({
      key: 'input',
      source: 'Implicit input',
      result: { ok: true, value: implicitInput },
      chosen: false,
    });
  }
  for (const [key, raw] of Object.entries(attributes)) {
    const rawPath = [...path, 'attributes', key];
    if (Array.isArray(raw)) {
      raw.forEach((item, index) => add(inputKey(key, index), item, [...rawPath, index]));
    } else if (isRecord(raw) && typeof raw['type'] !== 'string') {
      Object.entries(raw).forEach(([part, item]) => add(inputKey(key, part), item, [...rawPath, part]));
    } else {
      add(key, raw, rawPath);
    }
  }
  return rows;
}

function valueAt(document: unknown, path: JsonPath): unknown {
  let current = document;
  for (const part of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[part];
  }
  return current;
}

export function formatValue(value: Value): string {
  if (value === null) {
    return 'null';
  }
  return typeof value === 'string' ? `"${value}"` : String(value);
}

class StepError extends Error {}

/** Raised by a parent whose input step failed; the real cause is recorded on the child. */
class UpstreamError extends StepError {}

class Evaluator {
  readonly steps = new Map<string, StepResult>();
  readonly choices = new Map<string, string>();
  /** Variables declared by each conditional, keyed by the step path. */
  private readonly declaredVariables = new Map<string, DeclaredVariable[]>();
  /** Variable scopes of the conditionals currently being evaluated, innermost last. */
  private readonly scopes: TemplateVars[] = [];
  private readonly now: Date;
  private depth = 0;

  constructor(private readonly inputs: EvaluationInputs) {
    this.now = inputs.now ?? new Date();
  }

  run(node: Record<string, unknown>, path: JsonPath): Value {
    const key = pathKey(path) as string;
    if (this.depth > 64) {
      throw new StepError('The transform nests too deeply to evaluate.');
    }
    this.depth++;
    try {
      const value = this.compute(node, path);
      this.steps.set(key, this.withVariables(key, { ok: true, value }));
      return value;
    } catch (error) {
      const failure: StepResult =
        error instanceof UpstreamError
          ? { ok: false, error: 'An input of this step failed.', upstream: true }
          : { ok: false, error: describe(error) };
      this.steps.set(key, this.withVariables(key, failure));
      throw new UpstreamError(describe(error));
    } finally {
      this.depth--;
    }
  }

  private compute(node: Record<string, unknown>, path: JsonPath): Value {
    const type = String(node['type']);
    const attrs = isRecord(node['attributes']) ? node['attributes'] : {};
    const at = new AttributeReader(this, attrs, path);

    switch (type) {
      case 'accountAttribute': {
        const source = String(attrs['sourceName'] ?? attrs['applicationName'] ?? '');
        return this.inputs.accountAttributes[accountKey(source, String(attrs['attributeName'] ?? ''))] ?? null;
      }
      case 'identityAttribute':
        return this.inputs.identityAttributes[String(attrs['name'] ?? '')] ?? null;

      case 'lower':
        return mapText(at.input(), (text) => text.toLowerCase());
      case 'upper':
        return mapText(at.input(), (text) => text.toUpperCase());
      case 'trim':
        return mapText(at.input(), (text) => text.trim());
      case 'base64Encode':
        return mapText(at.input(), encodeBase64);
      case 'base64Decode':
        return mapText(at.input(), decodeBase64);
      case 'decomposeDiacriticalMarks':
        return mapText(at.input(), (text) => text.normalize('NFD').replace(/\p{M}/gu, ''));
      case 'normalizeNames':
        return mapText(at.input(), normalizeNames);

      case 'concat':
        return at.list('values').map((value) => (value === null ? '' : String(value))).join('');
      case 'join': {
        const separator = at.has('separator') ? String(at.value('separator') ?? '') : ',';
        return at
          .list('values')
          .map(String)
          .join(separator);
      }
      case 'firstValid':
        return this.firstValid(at);

      case 'static':
        return this.render(String(at.value('value') ?? ''), at.variables(['value']));
      case 'conditional':
        return this.conditional(at, path);

      case 'indexOf':
        return mapText(at.input(), (text) => text.indexOf(String(at.value('substring') ?? '')));
      case 'lastIndexOf':
        return mapText(at.input(), (text) => text.lastIndexOf(String(at.value('substring') ?? '')));
      case 'leftPad':
      case 'rightPad':
        return mapText(at.input(), (text) => pad(type, text, at.number('length', 0), at));
      case 'substring':
        return mapText(at.input(), (text) => substring(text, at));
      case 'split':
        return mapText(at.input(), (text) => split(text, at));

      case 'replace':
        return this.replace(at);
      case 'replaceAll': {
        const table = attrs['table'];
        if (!isRecord(table)) {
          throw new StepError('replaceAll needs a "table" of patterns and replacements.');
        }
        return mapText(at.input(), (text) =>
          Object.entries(table).reduce(
            (current, [pattern, replacement]) => current.replace(regex(pattern), String(replacement)),
            text,
          ),
        );
      }
      case 'lookup': {
        const table = attrs['table'];
        if (!isRecord(table)) {
          throw new StepError('lookup needs a "table" object.');
        }
        const input = at.input();
        const key = input === null ? 'null' : String(input);
        for (const entry of [key, 'default']) {
          if (entry in table) {
            at.choose(inputKey('table', entry));
            return toValue(table[entry]);
          }
        }
        throw new StepError(`The lookup table has no entry for "${key}" and no "default".`);
      }

      case 'dateFormat':
        return mapText(at.input(), (text) => {
          let date: Date;
          try {
            date = parseDate(text, String(at.value('inputFormat') ?? 'ISO8601'));
          } catch (error) {
            // The tenant returns null, without an error, for an input that does not match inputFormat.
            if (error instanceof DateError) return null;
            throw error;
          }
          return formatDate(date, String(at.value('outputFormat') ?? 'ISO8601'));
        });
      case 'dateMath': {
        const expression = String(at.value('expression') ?? '');
        const roundUp = at.value('roundUp') === true || at.value('roundUp') === 'true';
        const usesNow = expression.trim().startsWith('now');
        const input = usesNow ? null : at.input();
        if (!usesNow && input === null) return null;
        const base = input === null ? null : parseIso(String(input), this.now);
        return javaIsoString(applyDateMath(base, expression, roundUp, this.now));
      }
      case 'dateCompare':
        return this.dateCompare(at);

      case 'e164phone':
        return mapText(at.input(), (text) => e164(text, String(at.value('defaultRegion') ?? '')));
      case 'iso3166':
        return mapText(at.input(), (text) => iso3166(text, String(at.value('format') ?? 'alpha2')));
      case 'displayName': {
        const ids = this.inputs.identityAttributes;
        const given = ids['preferredName'] || ids['firstname'];
        const parts = [given, ids['lastname']].filter((part) => part);
        return parts.length ? parts.join(' ') : null;
      }

      case 'randomAlphaNumeric':
        return randomString(at.number('length', 32), 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
      case 'randomNumeric':
        return randomString(at.number('length', 10), '0123456789');
      case 'uuid':
        return crypto.randomUUID();
      case 'usernameGenerator': {
        const patterns = attrs['patterns'];
        if (!Array.isArray(patterns) || patterns.length === 0) {
          throw new StepError('usernameGenerator needs at least one pattern.');
        }
        const vars = at.variables(['patterns', 'sourceCheck']);
        vars.set('uniqueCounter', '');
        at.choose(inputKey('patterns', 0));
        return this.render(String(patterns[0]), vars);
      }

      case 'reference':
        throw new StepError(
          `This step reuses the transform "${String(attrs['id'] ?? '?')}", which is not loaded here.`,
        );
      case 'rule':
        throw new StepError('Rules run on the tenant and cannot be calculated here.');
      case 'rfc5646':
        throw new StepError('The RFC 5646 language table is not available offline.');
      default:
        throw new StepError(`"${type}" is not a known transform type, so it cannot be calculated.`);
    }
  }

  private firstValid(at: AttributeReader): Value {
    const ignoreErrors = at.value('ignoreErrors') === true || at.value('ignoreErrors') === 'true';
    const results = at.listResults('values');
    for (const [index, result] of results.entries()) {
      if (!result.ok) {
        if (ignoreErrors) continue;
        throw new UpstreamError(result.error);
      }
      if (result.value !== null && result.value !== '') {
        at.choose(inputKey('values', index));
        return result.value;
      }
    }
    return null;
  }

  private conditional(at: AttributeReader, path: JsonPath): Value {
    const expression = String(at.value('expression') ?? '');
    const match = /^\s*(.+?)\s+eq\s+(.+?)\s*$/.exec(expression);
    if (!match) {
      throw new StepError(`The expression "${expression}" must have the form "ValueA eq ValueB".`);
    }
    const vars = at.variables(['expression', 'positiveCondition', 'negativeCondition']);
    this.declaredVariables.set(
      pathKey(path) as string,
      [...vars.entries()].map(([name, value]) => ({ name, value: value ?? null })),
    );
    const side = (text: string) => {
      const name = /^\$\{?([A-Za-z_][\w-]*)\}?$/.exec(text);
      if (!name) return text;
      const value = vars.get(name[1]);
      return value === undefined || value === null ? null : String(value);
    };
    const equal = side(match[1]) === side(match[2]);
    const branch = equal ? 'positiveCondition' : 'negativeCondition';
    at.choose(branch);
    this.scopes.push(vars);
    try {
      const chosen = at.value(branch);
      return typeof chosen === 'string' ? this.render(chosen, vars) : (chosen ?? null);
    } finally {
      this.scopes.pop();
    }
  }

  private replace(at: AttributeReader): Value {
    const input = at.input();
    if (input === null) {
      return null;
    }
    const pattern = regex(String(at.value('regex') ?? ''));
    const replacement = this.replacement(at.value('replacement'));
    const text = String(input);
    if (replacement === null) {
      pattern.lastIndex = 0;
      return pattern.test(text) ? null : text;
    }
    return text.replace(pattern, String(replacement));
  }

  /** Renders a replacement when it is a Velocity template, so #set($x = null)$x can yield null. */
  private replacement(value: Value | undefined): Value {
    if (typeof value !== 'string' || !looksLikeTemplate(value)) {
      return value ?? '';
    }
    return this.render(value, new Map());
  }

  /** Substitutes $variables from the conditionals wrapped around the current step. */
  resolveText(value: Value): Value {
    if (typeof value !== 'string' || this.scopes.length === 0 || !looksLikeTemplate(value)) {
      return value;
    }
    const scope: TemplateVars = new Map();
    for (const frame of this.scopes) {
      for (const [name, variable] of frame) {
        scope.set(name, variable);
      }
    }
    return this.render(value, scope);
  }

  private withVariables(key: string, result: StepResult): StepResult {
    const variables = this.declaredVariables.get(key);
    return variables?.length ? { ...result, variables } : result;
  }

  private dateCompare(at: AttributeReader): Value {
    const toDate = (key: string): Date => {
      const value = at.value(key);
      if (value === null || value === undefined) {
        throw new StepError(`dateCompare is missing ${key}.`);
      }
      return parseIso(String(value), this.now);
    };
    const first = toDate('firstDate').getTime();
    const second = toDate('secondDate').getTime();
    const operator = String(at.value('operator') ?? '').toUpperCase();
    const outcomes: Record<string, boolean> = {
      LT: first < second,
      LTE: first <= second,
      GT: first > second,
      GTE: first >= second,
    };
    if (!(operator in outcomes)) {
      throw new StepError(`dateCompare operator "${operator}" must be LT, LTE, GT or GTE.`);
    }
    const branch = outcomes[operator] ? 'positiveCondition' : 'negativeCondition';
    at.choose(branch);
    return toValue(at.value(branch));
  }

  private render(template: string, vars: TemplateVars): Value {
    return renderTemplate(template, vars);
  }

  evaluateChild(value: unknown, path: JsonPath): Value {
    if (isRecord(value) && typeof value['type'] === 'string') {
      return this.run(value, path);
    }
    const literal = this.resolveText(toValue(value));
    this.steps.set(pathKey(path) as string, { ok: true, value: literal });
    return literal;
  }

  /** Keeps the value a scalar attribute actually used, after $variable substitution. */
  remember(path: JsonPath, value: Value): void {
    this.steps.set(pathKey(path) as string, { ok: true, value });
  }

  implicitInput(): Value {
    return this.inputs.implicitInput;
  }
}

/** Reads one transform's attributes, evaluating nested transforms on demand. */
class AttributeReader {
  private readonly cache = new Map<string, Value>();

  constructor(
    private readonly evaluator: Evaluator,
    private readonly attrs: Record<string, unknown>,
    private readonly path: JsonPath,
  ) {}

  has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.attrs, key);
  }

  value(key: string): Value | undefined {
    if (!this.has(key)) {
      return undefined;
    }
    if (!this.cache.has(key)) {
      const raw = this.attrs[key];
      const value =
        isRecord(raw) && typeof raw['type'] === 'string'
          ? this.evaluator.evaluateChild(raw, [...this.path, 'attributes', key])
          : this.evaluator.resolveText(toValue(raw));
      if (!(isRecord(raw) && typeof raw['type'] === 'string')) {
        this.evaluator.remember([...this.path, 'attributes', key], value ?? null);
      }
      this.cache.set(key, value);
    }
    return this.cache.get(key) ?? null;
  }

  choose(key: string): void {
    this.evaluator.choices.set(pathKey(this.path) as string, key);
  }

  input(): Value {
    return this.has('input') ? (this.value('input') ?? null) : this.evaluator.implicitInput();
  }

  number(key: string, fallback: number): number {
    const value = this.value(key);
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new StepError(`${key} must be a number, not "${value}".`);
    }
    return parsed;
  }

  list(key: string): Value[] {
    return this.listResults(key).map((result) => {
      if (!result.ok) {
        throw new UpstreamError(result.error);
      }
      return result.value;
    });
  }

  /** Evaluates every item so each one shows its own result, even after a failure. */
  listResults(key: string): StepResult[] {
    const raw = this.attrs[key];
    if (!Array.isArray(raw)) {
      throw new StepError(`"${key}" must be a list.`);
    }
    return raw.map((item, index) => {
      try {
        return { ok: true, value: this.evaluator.evaluateChild(item, [...this.path, 'attributes', key, index]) };
      } catch (error) {
        return { ok: false, error: describe(error) };
      }
    });
  }

  /** Every attribute except the excluded ones, for $variables in templates. */
  variables(exclude: string[]): TemplateVars {
    const vars: TemplateVars = new Map<string, TemplateValue>();
    for (const key of Object.keys(this.attrs)) {
      if (!exclude.includes(key)) {
        const value = this.value(key);
        vars.set(key, value === undefined ? null : value);
      }
    }
    return vars;
  }
}

function looksLikeTemplate(value: string): boolean {
  return /\$!?\{?[A-Za-z_]/.test(value) || /#\{?(?:set|if)\b/.test(value);
}

function nowDateMath(type: string, attributes: Record<string, unknown>): boolean {
  return type === 'dateMath' && String(attributes['expression'] ?? '').trim().startsWith('now');
}

function mapText(value: Value, apply: (text: string) => Value): Value {
  return value === null ? null : apply(String(value));
}

function toValue(raw: unknown): Value {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw;
  return JSON.stringify(raw);
}

function describe(error: unknown): string {
  if (error instanceof StepError || error instanceof DateError || error instanceof TemplateError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function regex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'g');
  } catch {
    throw new StepError(`"${pattern}" is not a valid regular expression.`);
  }
}

function pad(type: string, text: string, length: number, at: AttributeReader): string {
  const padding = at.has('padding') ? String(at.value('padding') ?? ' ') : ' ';
  if (padding === '') {
    return text;
  }
  return type === 'leftPad' ? text.padStart(length, padding) : text.padEnd(length, padding);
}

function substring(text: string, at: AttributeReader): string {
  const beginAttr = at.number('begin', 0);
  const endAttr = at.has('end') ? at.number('end', -1) : -1;
  const begin = beginAttr === -1 ? 0 : beginAttr + at.number('beginOffset', 0);
  const end = endAttr === -1 ? text.length : endAttr + at.number('endOffset', 0);
  if (begin < 0 || end > text.length || begin > end) {
    throw new StepError(`Cannot take characters ${begin} to ${end} of a ${text.length}-character string.`);
  }
  return text.substring(begin, end);
}

function split(text: string, at: AttributeReader): Value {
  const delimiter = String(at.value('delimiter') ?? '');
  const index = at.number('index', 0);
  let parts: string[];
  try {
    parts = javaSplit(text, delimiter, 0);
  } catch {
    throw new StepError(`"${delimiter}" is not a valid split delimiter.`);
  }
  if (index >= 0 && index < parts.length) {
    return parts[index];
  }
  if (at.value('throws') === false || at.value('throws') === 'false') {
    return null;
  }
  throw new StepError(`Split resulted in ${parts.length} items and you attempted to index at ${index}.`);
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64(text: string): string {
  try {
    const bytes = Uint8Array.from(atob(text.trim()), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    throw new StepError(`"${text}" is not valid Base64.`);
  }
}

const NAME_PARTICLES = new Set(['von', 'van', 'de', 'der', 'den', 'la', 'le', 'du', 'da', 'di', 'del', 'dos', 'das']);

function normalizeNames(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (index > 0 && NAME_PARTICLES.has(word)) return word;
      if (/^(i{1,3}|iv|v|vi{0,3})$/.test(word)) return word.toUpperCase();
      return word.replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, char: string) => sep + char.toUpperCase())
        .replace(/^(Ma?c)(\p{L})/u, (_, prefix: string, char: string) => prefix + char.toUpperCase());
    })
    .join(' ');
}

const COUNTRY_CALLING_CODES: Record<string, string> = {
  US: '1', CA: '1', GB: '44', FR: '33', DE: '49', ES: '34', IT: '39', NL: '31', BE: '32',
  CH: '41', AT: '43', IE: '353', PT: '351', SE: '46', NO: '47', DK: '45', FI: '358', PL: '48',
  IN: '91', AU: '61', NZ: '64', JP: '81', CN: '86', SG: '65', BR: '55', MX: '52', ZA: '27',
};

function e164(text: string, defaultRegion: string): string {
  const digits = text.replace(/\D/g, '');
  if (text.trim().startsWith('+')) {
    return `+${digits}`;
  }
  if (text.trim().startsWith('00')) {
    return `+${digits.slice(2)}`;
  }
  const region = defaultRegion.toUpperCase() || 'US';
  const code = COUNTRY_CALLING_CODES[region];
  if (!code) {
    throw new StepError(`The calling code for region "${region}" is not known offline.`);
  }
  return `+${code}${digits.replace(/^0+/, '').replace(new RegExp(`^${code}(?=\\d{9,})`), '')}`;
}

let regionNames: Map<string, string> | null = null;

function iso3166(text: string, format: string): string {
  if (format !== 'alpha2') {
    throw new StepError(`Only the alpha2 format is available offline, not "${format}".`);
  }
  if (!regionNames) {
    regionNames = new Map();
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const name = names.of(code);
        if (name && name !== code) {
          // Reserved codes such as FX reuse a country's name; keep the official code.
          if (!regionNames.has(name.toLowerCase())) {
            regionNames.set(name.toLowerCase(), code);
          }
          regionNames.set(code.toLowerCase(), code);
        }
      }
    }
  }
  const code = regionNames.get(text.trim().toLowerCase());
  if (!code) {
    throw new StepError(`"${text}" is not a recognised country.`);
  }
  return code;
}

function randomString(length: number, alphabet: string): string {
  const bytes = crypto.getRandomValues(new Uint32Array(Math.max(0, Math.min(length, 450))));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
