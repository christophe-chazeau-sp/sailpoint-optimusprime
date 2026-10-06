import { Compile, Helper, render } from 'velocityjs';

type CompileConfig = NonNullable<Parameters<typeof render>[3]>;

/**
 * Velocity templates rendered by velocityjs, adjusted to behave like Apache Velocity as configured
 * in Identity Security Cloud: strings answer Java String methods, only null and false are false in
 * conditions, and printing an undefined or null reference fails, even when it is written $!x.
 */

export type TemplateValue = string | number | boolean | null;
export type TemplateVars = Map<string, TemplateValue>;

export class TemplateError extends Error {}

export function renderTemplate(template: string, vars: TemplateVars): TemplateValue {
  const context: Record<string, unknown> = {};
  for (const [name, value] of vars) {
    context[name] = value;
  }
  const config: CompileConfig = { customMethodHandlers: [JAVA_STRING_METHODS] };
  try {
    return render(template, context, {}, config);
  } catch (error) {
    if (error instanceof TemplateError) {
      throw error;
    }
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new TemplateError(`The template cannot be rendered: ${message}`);
  }
}

function javaTruthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

interface Ast {
  type: string;
  condition?: Ast;
  operator?: string;
  expression?: Ast[];
  leader?: string;
}

interface CompileInternals {
  silence?: boolean;
  contextId: string;
  getExpression(ast: Ast): unknown;
  getReferences(ast: Ast, isVal?: boolean): unknown;
  renderAstList(asts: Ast[], contextId: string): string;
}

const compile = Compile.prototype as unknown as CompileInternals;
const baseExpression = compile.getExpression;
const baseReferences = compile.getReferences;

compile.getExpression = function (this: CompileInternals, ast: Ast) {
  const [left, right] = ast.expression ?? [];
  switch (ast.type === 'math' ? ast.operator : undefined) {
    case '&&':
      return javaTruthy(this.getExpression(left)) && javaTruthy(this.getExpression(right));
    case '||':
      return javaTruthy(this.getExpression(left)) || javaTruthy(this.getExpression(right));
    case 'not':
      return !javaTruthy(this.getExpression(left));
    default:
      return baseExpression.call(this, ast);
  }
};

compile.getReferences = function (this: CompileInternals, ast: Ast, isVal?: boolean) {
  if (!isVal) {
    return baseReferences.call(this, ast, isVal);
  }
  const value = baseReferences.call(this, ast, false);
  if (value !== null && value !== undefined) {
    return value;
  }
  throw new TemplateError(`Error rendering template: ${Helper.getRefText(ast as never)} has no value.`);
};

(compile as unknown as { getBlockIf(block: Ast[]): string }).getBlockIf = function (
  this: CompileInternals,
  block: Ast[],
) {
  let received = false;
  const asts: Ast[] = [];
  block.some((ast) => {
    const hasCondition = ast.type === 'elseif' || ast.type === 'if';
    if (!(hasCondition || ast.type === 'else')) {
      if (received) asts.push(ast);
      return false;
    }
    if (received) return true;
    received = hasCondition ? javaTruthy(this.getExpression(ast.condition as Ast)) : true;
    return false;
  });
  return this.renderAstList(asts, this.contextId);
};

type JavaMethod = (text: string, ...args: unknown[]) => unknown;

const STRING_METHODS: Record<string, JavaMethod> = {
  length: (text) => text.length,
  isEmpty: (text) => text.length === 0,
  isBlank: (text) => text.trim().length === 0,
  charAt: (text, index) => text.charAt(checkIndex(text, Number(index), text.length - 1)),
  substring: (text, begin, end) => {
    const from = Number(begin);
    const to = end === undefined ? text.length : Number(end);
    if (from < 0 || to > text.length || from > to) {
      throw new TemplateError(`substring(${from}, ${to}) is out of range for "${text}".`);
    }
    return text.substring(from, to);
  },
  indexOf: (text, search, from) => text.indexOf(String(search), from === undefined ? 0 : Number(from)),
  lastIndexOf: (text, search, from) =>
    from === undefined ? text.lastIndexOf(String(search)) : text.lastIndexOf(String(search), Number(from)),
  contains: (text, search) => text.includes(String(search)),
  startsWith: (text, prefix, offset) => text.startsWith(String(prefix), offset === undefined ? 0 : Number(offset)),
  endsWith: (text, suffix) => text.endsWith(String(suffix)),
  equals: (text, other) => typeof other === 'string' && text === other,
  equalsIgnoreCase: (text, other) => typeof other === 'string' && text.toLowerCase() === other.toLowerCase(),
  compareTo: (text, other) => compareStrings(text, String(other)),
  compareToIgnoreCase: (text, other) => compareStrings(text.toLowerCase(), String(other).toLowerCase()),
  concat: (text, other) => text + String(other),
  replace: (text, target, replacement) => text.split(String(target)).join(String(replacement)),
  replaceAll: (text, pattern, replacement) => text.replace(javaRegex(pattern, 'g'), javaReplacement(replacement)),
  replaceFirst: (text, pattern, replacement) => text.replace(javaRegex(pattern, ''), javaReplacement(replacement)),
  matches: (text, pattern) => javaRegex(`^(?:${String(pattern)})$`, '').test(text),
  split: (text, pattern, limit) => javaSplit(text, String(pattern), limit === undefined ? 0 : Number(limit)),
  toLowerCase: (text) => text.toLowerCase(),
  toUpperCase: (text) => text.toUpperCase(),
  trim: (text) => text.trim(),
  strip: (text) => text.trim(),
  toString: (text: string) => text,
};

type MethodHandler = NonNullable<CompileConfig['customMethodHandlers']>[number];

const JAVA_STRING_METHODS: MethodHandler = {
  uid: 'java-string',
  match: ({ context, property }) => typeof context === 'string' && Object.hasOwn(STRING_METHODS, property),
  resolve: ({ context, property, params }) => STRING_METHODS[property](context as string, ...params),
};

function checkIndex(text: string, index: number, max: number): number {
  if (!Number.isInteger(index) || index < 0 || index > max) {
    throw new TemplateError(`Index ${index} is out of range for "${text}".`);
  }
  return index;
}

function compareStrings(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function javaRegex(pattern: unknown, flags: string): RegExp {
  try {
    return new RegExp(String(pattern), flags);
  } catch {
    throw new TemplateError(`"${String(pattern)}" is not a valid regular expression.`);
  }
}

/** Java writes a literal dollar as \$ in replacements; JavaScript uses $$. */
function javaReplacement(replacement: unknown): string {
  return String(replacement).replace(/\\\$/g, '$$$$');
}

/** Java's String.split: a regex delimiter, and trailing empty strings dropped unless a limit is given. */
export function javaSplit(text: string, pattern: string, limit: number): string[] {
  const parts = text.split(javaRegex(pattern, ''));
  if (limit > 0 && parts.length > limit) {
    const kept = parts.slice(0, limit - 1);
    const regex = javaRegex(pattern, 'g');
    let consumed = 0;
    for (let i = 0; i < limit - 1; i++) {
      const match = regex.exec(text);
      if (!match) break;
      consumed = match.index + match[0].length;
    }
    return [...kept, text.slice(consumed)];
  }
  if (limit === 0) {
    while (parts.length > 1 && parts[parts.length - 1] === '') {
      parts.pop();
    }
  }
  return parts;
}
