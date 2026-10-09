import { lookupOperation, usesImplicitInput } from '../catalog/operations';
import { JsonPath } from '../model/transform-graph';
import { pathKey } from '../source-range';

/**
 * A rule-based reading of a transform: what it literally does, in plain English. Names of
 * attributes, sources and values are wrapped in backticks so the UI can show them as chips.
 */
export interface Explanation {
  /** One sentence for the whole transform. */
  summary: string;
  /** "Where ..." lines for variables and for sub-steps too deep to read inline. */
  details: string[];
  /** Known pitfalls found in the document. */
  notes: string[];
  /** One line per step, keyed by {@link pathKey} of the step. */
  steps: Map<string, string>;
}

type Json = unknown;
type Attributes = Record<string, Json>;

/** Sub-steps nest inline up to this depth; deeper ones are explained in the details. */
const MAX_DEPTH = 3;

const FORCE_NULL_NOTE =
  'A replacement such as #set($x = null)$x returns null here, but fails on the tenant instead.';
const VELOCITY_NOTE = 'This transform uses a Velocity template, which may behave differently on the tenant.';

const DATE_OPERATORS: Record<string, string> = {
  LT: 'before',
  LTE: 'on or before',
  GT: 'after',
  GTE: 'on or after',
};

const DATE_UNITS: Record<string, string> = {
  y: 'year',
  M: 'month',
  w: 'week',
  d: 'day',
  h: 'hour',
  H: 'hour',
  m: 'minute',
  s: 'second',
};

/** Attributes of a conditional that are not variables. */
const CONDITIONAL_KEYS = new Set(['expression', 'positiveCondition', 'negativeCondition']);

function isRecord(value: Json): value is Attributes {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStep(value: Json): value is Attributes & { type: string } {
  return isRecord(value) && typeof value['type'] === 'string';
}

function attributesOf(step: Attributes): Attributes {
  return isRecord(step['attributes']) ? step['attributes'] : {};
}

function looksLikeTemplate(text: string): boolean {
  return /[$#]/.test(text);
}

function chip(text: Json): string {
  return '`' + String(text).replace(/`/g, "'") + '`';
}

function quoted(text: Json): string {
  return `'${String(text)}'`;
}

/** "A", "A and B", "A, B and C". */
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function plural(count: number, unit: string, units = `${unit}s`): string {
  return `${count} ${count === 1 ? unit : units}`;
}

function isTrue(value: Json): boolean {
  return value === true || value === 'true';
}

/** How phrases are put together: the summary defers deep steps, step lines name their children. */
interface Context {
  mode: 'summary' | 'step';
  details: string[];
  /** Deep steps already deferred to the details, by path, with their label. */
  deferred: Map<string, string>;
}

/** Steps that read as a short phrase, so they are always written inline. */
function isLeaf(value: Json): boolean {
  if (!isStep(value)) return true;
  const attributes = attributesOf(value);
  switch (value.type) {
    case 'identityAttribute':
    case 'accountAttribute':
    case 'reference':
    case 'rule':
    case 'uuid':
    case 'randomAlphaNumeric':
    case 'randomNumeric':
    case 'displayName':
      return true;
    case 'static':
      return !looksLikeTemplate(String(attributes['value'] ?? ''));
    case 'dateMath':
      return String(attributes['expression'] ?? '').trim().startsWith('now');
    default:
      return false;
  }
}

class Explainer {
  constructor(private readonly context: Context) {}

  /** A noun phrase for any value of the document: a literal or a step. */
  describe(value: Json, path: JsonPath, depth: number, short = false): string {
    if (!isStep(value)) {
      return short && value === 'now' ? 'now' : this.literal(value);
    }
    if (depth > 0 && !isLeaf(value)) {
      if (this.context.mode === 'step') {
        return `the ${lookupOperation(value.type)?.label ?? value.type} result`;
      }
      if (depth > MAX_DEPTH) {
        return this.defer(value, path);
      }
    }
    return this.step(value, path, depth, short);
  }

  private literal(value: Json): string {
    if (value === null || value === undefined) return 'nothing (null)';
    if (typeof value !== 'string') return Array.isArray(value) || isRecord(value) ? 'a value' : String(value);
    const variable = /^\$\{?([A-Za-z_][\w-]*)\}?$/.exec(value.trim());
    if (variable) return chip(variable[1]);
    return looksLikeTemplate(value) ? `the template ${chip(value)}` : quoted(value);
  }

  /** Names a deep step and explains it in the details, so the summary stays readable. */
  private defer(value: Attributes & { type: string }, path: JsonPath): string {
    const key = pathKey(path) as string;
    let label = this.context.deferred.get(key);
    if (!label) {
      label = `calculated value ${String.fromCharCode(65 + this.context.deferred.size)}`;
      this.context.deferred.set(key, label);
      const phrase = this.step(value, path, 1);
      this.context.details.push(`Where ${label} is ${phrase}.`);
    }
    return `${label} (see below)`;
  }

  private child(attributes: Attributes, key: string, path: JsonPath, depth: number, short = false): string {
    return this.describe(attributes[key], [...path, 'attributes', key], depth + 1, short);
  }

  /** The step's input: its "input" attribute, or the implicit input when it reads one. */
  private input(type: string, attributes: Attributes, path: JsonPath, depth: number): string {
    if (Object.prototype.hasOwnProperty.call(attributes, 'input')) {
      return this.child(attributes, 'input', path, depth);
    }
    return usesImplicitInput(type, attributes) ? 'the mapped source attribute' : 'its input';
  }

  private items(attributes: Attributes, key: string, path: JsonPath, depth: number): string[] {
    const list = attributes[key];
    return Array.isArray(list)
      ? list.map((item, index) => this.describe(item, [...path, 'attributes', key, index], depth + 1))
      : [];
  }

  private step(value: Attributes & { type: string }, path: JsonPath, depth: number, short = false): string {
    const type = value.type;
    const a = attributesOf(value);
    const input = () => this.input(type, a, path, depth);
    const text = (key: string, fallback = '') => String(a[key] ?? fallback);

    switch (type) {
      case 'identityAttribute':
        return short ? chip(text('name')) : `the identity's ${chip(text('name'))}`;
      case 'accountAttribute':
        return `the ${chip(text('attributeName'))} of the identity's ${chip(text('sourceName', text('applicationName')))} account`;

      case 'lower':
        return `${input()} in lowercase`;
      case 'upper':
        return `${input()} in uppercase`;
      case 'trim':
        return `${input()} without surrounding spaces`;
      case 'base64Encode':
        return `${input()} encoded in Base64`;
      case 'base64Decode':
        return `${input()} decoded from Base64`;
      case 'decomposeDiacriticalMarks':
        return `${input()} without accents`;
      case 'normalizeNames':
        return `${input()} with the case of names normalized`;

      case 'concat':
        return `${listOf(this.items(a, 'values', path, depth))} joined together`;
      case 'join': {
        const separator = Object.prototype.hasOwnProperty.call(a, 'separator') ? text('separator') : ',';
        return `${listOf(this.items(a, 'values', path, depth))} joined with ${quoted(separator)}`;
      }
      case 'firstValid': {
        const items = this.items(a, 'values', path, depth);
        const choices =
          items.length > 1 ? `${items.slice(0, -1).join(', ')}, else ${items[items.length - 1]}` : items.join('');
        return `the first non-empty of: ${choices}${isTrue(a['ignoreErrors']) ? ' (errors count as empty)' : ''}`;
      }

      case 'static': {
        const template = text('value');
        if (!looksLikeTemplate(template)) return quoted(template);
        this.variables(a, new Set(['value']), path, depth);
        return `a Velocity template: ${chip(template)}`;
      }
      case 'conditional':
      case 'dateCompare':
        return this.chain(value, path, depth);

      case 'indexOf':
        return `the position of ${quoted(text('substring'))} in ${input()}`;
      case 'lastIndexOf':
        return `the last position of ${quoted(text('substring'))} in ${input()}`;
      case 'leftPad':
      case 'rightPad': {
        const padding = a['padding'] === undefined || a['padding'] === ' ' ? 'spaces' : quoted(a['padding']);
        const side = type === 'leftPad' ? 'left' : 'right';
        return `${input()} padded on the ${side} to ${text('length', '?')} characters with ${padding}`;
      }
      case 'substring': {
        const end = a['end'] === undefined || Number(a['end']) === -1 ? 'the end' : `position ${text('end')}`;
        return `part of ${input()}, from position ${text('begin', '0')} to ${end}`;
      }
      case 'split':
        return `item ${text('index', '0')} of ${input()} split on ${quoted(text('delimiter'))}`;
      case 'replace': {
        const replacement = text('replacement');
        const by = looksLikeTemplate(replacement) ? `the Velocity template ${chip(replacement)}` : quoted(replacement);
        return `${input()} with matches of ${chip(text('regex'))} replaced by ${by}`;
      }
      case 'replaceAll': {
        const count = isRecord(a['table']) ? Object.keys(a['table']).length : 0;
        return `${input()} with ${plural(count, 'pattern')} replaced`;
      }
      case 'lookup': {
        const table = isRecord(a['table']) ? a['table'] : {};
        const entries = Object.keys(table).filter((key) => key !== 'default').length;
        const fallback = 'default' in table ? `default ${quoted(table['default'])}` : 'no default';
        return `${input()} translated through a table of ${plural(entries, 'entry', 'entries')} (${fallback})`;
      }

      case 'dateMath':
        return this.dateMath(a, input);
      case 'dateFormat':
        return `${input()} reformatted from ${chip(text('inputFormat', 'ISO8601'))} to ${chip(text('outputFormat', 'ISO8601'))}`;

      case 'e164phone':
        return `${input()} as an E.164 phone number${a['defaultRegion'] ? ` (default region ${quoted(a['defaultRegion'])})` : ''}`;
      case 'iso3166':
        return `${input()} as an ISO 3166 country code (${text('format', 'alpha2')})`;
      case 'rfc5646':
        return `${input()} as an RFC 5646 language tag`;
      case 'displayName':
        return "the identity's preferred name, or else first name, followed by the last name";
      case 'uuid':
        return 'a new random UUID';
      case 'randomAlphaNumeric':
        return `a random string of ${text('length', '32')} letters and digits`;
      case 'randomNumeric':
        return `a random number of ${text('length', '10')} digits`;
      case 'usernameGenerator': {
        const patterns = Array.isArray(a['patterns']) ? a['patterns'] : [];
        const first = patterns.length ? `, starting with ${chip(patterns[0])}` : '';
        return `a unique username built from ${plural(patterns.length, 'pattern')}${first}`;
      }
      case 'reference':
        return `the result of the transform ${quoted(text('id', '?'))}`;
      case 'rule':
        return `the result of the rule ${quoted(text('name', '?'))}`;
      default:
        return `a ${chip(type)} step`;
    }
  }

  /** "P if C, otherwise N", flattening nested conditionals into "...; otherwise P2 if C2; ...". */
  private chain(first: Attributes & { type: string }, firstPath: JsonPath, depth: number): string {
    const parts: string[] = [];
    let current: Json = first;
    let path = firstPath;
    while (isStep(current) && (current.type === 'conditional' || current.type === 'dateCompare')) {
      const a = attributesOf(current);
      const condition = current.type === 'conditional' ? this.expression(a, path, depth) : this.dateCondition(a, path, depth);
      parts.push(`${this.child(a, 'positiveCondition', path, depth)} if ${condition}`);
      current = a['negativeCondition'];
      path = [...path, 'attributes', 'negativeCondition'];
      if (this.context.mode === 'step') {
        break;
      }
    }
    const otherwise = this.describe(current, path, depth + 1);
    const phrase =
      parts.length > 1 ? `${parts.join('; otherwise ')}; otherwise ${otherwise}` : `${parts[0]}, otherwise ${otherwise}`;
    return depth > 0 && parts.length > 1 ? `(${phrase})` : phrase;
  }

  private dateCondition(a: Attributes, path: JsonPath, depth: number): string {
    const operator = String(a['operator'] ?? '').toUpperCase();
    const first = this.child(a, 'firstDate', path, depth, true);
    const second = this.child(a, 'secondDate', path, depth, true);
    return `${first} is ${DATE_OPERATORS[operator] ?? `${chip(a['operator'])}`} ${second}`;
  }

  private expression(a: Attributes, path: JsonPath, depth: number): string {
    const variables = this.variables(a, CONDITIONAL_KEYS, path, depth);
    const match = /^\s*(.+?)\s+eq\s+(.+?)\s*$/.exec(String(a['expression'] ?? ''));
    const side = (text: string) => {
      const name = /^\$\{?([A-Za-z_][\w-]*)\}?$/.exec(text);
      return name ? chip(name[1]) : quoted(text);
    };
    const condition = match ? `${side(match[1])} is ${side(match[2])}` : chip(a['expression'] ?? '');
    return variables ? `${condition} (where ${variables})` : condition;
  }

  /**
   * Declared variables: in the summary they become "Where" lines; in a step line they are
   * returned to be written inline.
   */
  private variables(a: Attributes, reserved: Set<string>, path: JsonPath, depth: number): string {
    const lines: string[] = [];
    for (const name of Object.keys(a)) {
      if (reserved.has(name) || name === 'requiresPeriodicRefresh') continue;
      const phrase = this.child(a, name, path, depth);
      if (this.context.mode === 'summary') {
        this.context.details.push(`Where ${chip(name)} is ${phrase}.`);
      } else {
        lines.push(`${chip(name)} is ${phrase}`);
      }
    }
    return lines.join(', ');
  }

  private dateMath(a: Attributes, input: () => string): string {
    const expression = String(a['expression'] ?? '').trim();
    const usesNow = expression.startsWith('now');
    const body = usesNow ? expression.slice(3) : expression;
    const rounding = /\/([yMwdhHms])\s*$/.exec(body);
    const operations = [...body.replace(/\/[yMwdhHms]\s*$/, '').matchAll(/([+-])\s*(\d+)\s*([yMwdhHms])/g)].map(
      ([, sign, amount, unit]) => ({ sign, text: plural(Number(amount), DATE_UNITS[unit]) }),
    );
    let phrase: string;
    if (usesNow && operations.length === 1) {
      phrase = operations[0].sign === '+' ? `${operations[0].text} from now` : `${operations[0].text} ago`;
    } else {
      const steps = operations.map((operation) => `${operation.sign === '+' ? 'plus' : 'minus'} ${operation.text}`);
      phrase = [usesNow ? 'now' : input(), ...steps].join(' ');
    }
    if (rounding) {
      const unit = DATE_UNITS[rounding[1]];
      phrase += isTrue(a['roundUp']) ? `, rounded up to the ${unit}` : `, rounded to the ${unit}`;
    }
    return phrase;
  }
}

/** Every step of the document with its path, depth first. */
function* stepsOf(value: Json, path: JsonPath): Generator<[Attributes & { type: string }, JsonPath]> {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* stepsOf(item, [...path, index]);
    return;
  }
  if (!isRecord(value)) return;
  if (isStep(value)) {
    yield [value, path];
    const attributes = attributesOf(value);
    for (const key of Object.keys(attributes)) yield* stepsOf(attributes[key], [...path, 'attributes', key]);
  }
}

function strings(value: Json, key = ''): [string, string][] {
  if (typeof value === 'string') return [[key, value]];
  if (Array.isArray(value)) return value.flatMap((item) => strings(item, key));
  if (isRecord(value)) return Object.entries(value).flatMap(([name, item]) => strings(item, name));
  return [];
}

function notesFor(document: Json): string[] {
  const notes: string[] = [];
  const found = strings(document);
  if (found.some(([, text]) => /#set\s*\(\s*\$\{?\w+\}?\s*=\s*null\s*\)/.test(text))) {
    notes.push(FORCE_NULL_NOTE);
  }
  const usesVelocity = [...stepsOf(document, [])].some(([step]) => {
    const a = attributesOf(step);
    return (
      (step.type === 'static' && looksLikeTemplate(String(a['value'] ?? ''))) ||
      (step.type === 'replace' && looksLikeTemplate(String(a['replacement'] ?? ''))) ||
      step.type === 'usernameGenerator'
    );
  });
  if (usesVelocity) {
    notes.push(VELOCITY_NOTE);
  }
  return notes;
}

export interface Segment {
  text: string;
  /** Shown as a chip: a name or value that was in backticks. */
  code: boolean;
}

/** Splits an explanation line on its backticks, so names can be shown as chips. */
export function segments(line: string): Segment[] {
  return line
    .split('`')
    .map((text, index) => ({ text, code: index % 2 === 1 }))
    .filter((segment) => segment.text !== '');
}

export function explainTransform(document: Json): Explanation {
  const details: string[] = [];
  const root = new Explainer({ mode: 'summary', details, deferred: new Map() }).describe(document, [], 0);
  const name = isStep(document) && typeof document['name'] === 'string' && document['name'].trim();
  const summary = name ? `“${name}” returns ${root}.` : `Returns ${root}.`;

  const steps = new Map<string, string>();
  const stepExplainer = new Explainer({ mode: 'step', details: [], deferred: new Map() });
  for (const [step, path] of stepsOf(document, [])) {
    steps.set(pathKey(path) as string, `Returns ${stepExplainer.describe(step, path, 0)}.`);
  }

  return { summary, details, notes: notesFor(document), steps };
}
