/**
 * A small Velocity subset, enough for typical static and conditional transforms:
 * $var, ${var}, $!var, simple string methods, #set, and #if / #elseif / #else / #end
 * with ==, !=, <, >, <=, >=, &&, ||, ! (and the and / or / not keywords).
 */

export type TemplateValue = string | number | boolean | null;
export type TemplateVars = Map<string, TemplateValue>;

export class TemplateError extends Error {}

type Node =
  | { kind: 'text'; text: string }
  | { kind: 'ref'; ref: Reference; raw: string }
  | { kind: 'set'; name: string; expression: string }
  | { kind: 'if'; branches: { condition: string; body: Node[] }[]; otherwise: Node[] };

interface Reference {
  name: string;
  quiet: boolean;
  methods: { name: string; args: string }[];
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  const scope = new Map(vars);
  const parser = new TemplateParser(template);
  const nodes = parser.parseBlock([]).nodes;
  return renderNodes(nodes, scope);
}

/** Names referenced by a template, so callers know which variables it needs. */
export function templateNames(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(/\$!?\{?([A-Za-z_][\w-]*)/g)) {
    names.add(match[1]);
  }
  return [...names];
}

function renderNodes(nodes: Node[], scope: TemplateVars): string {
  let output = '';
  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        output += node.text;
        break;
      case 'ref': {
        const value = resolveReference(node.ref, scope);
        output += value === null || value === undefined ? (node.ref.quiet ? '' : node.raw) : String(value);
        break;
      }
      case 'set':
        scope.set(node.name, evaluateExpression(node.expression, scope));
        break;
      case 'if': {
        const branch = node.branches.find((item) =>
          truthy(evaluateExpression(item.condition, scope)),
        );
        output += renderNodes(branch ? branch.body : node.otherwise, scope);
        break;
      }
    }
  }
  return output;
}

function resolveReference(ref: Reference, scope: TemplateVars): TemplateValue | undefined {
  let value: TemplateValue | undefined = scope.get(ref.name);
  for (const method of ref.methods) {
    if (value === null || value === undefined) {
      return value;
    }
    value = callMethod(String(value), method.name, method.args, scope);
  }
  return value;
}

function callMethod(text: string, name: string, args: string, scope: TemplateVars): TemplateValue {
  const values = splitArgs(args).map((arg) => evaluateExpression(arg, scope));
  switch (name) {
    case 'toUpperCase':
      return text.toUpperCase();
    case 'toLowerCase':
      return text.toLowerCase();
    case 'trim':
      return text.trim();
    case 'length':
      return text.length;
    case 'substring':
      return text.substring(Number(values[0]), values[1] === undefined ? undefined : Number(values[1]));
    case 'replace':
      return text.split(String(values[0])).join(String(values[1]));
    case 'contains':
      return text.includes(String(values[0]));
    case 'startsWith':
      return text.startsWith(String(values[0]));
    case 'endsWith':
      return text.endsWith(String(values[0]));
    case 'equals':
      return text === String(values[0]);
    case 'equalsIgnoreCase':
      return text.toLowerCase() === String(values[0]).toLowerCase();
    case 'isEmpty':
      return text.length === 0;
    default:
      throw new TemplateError(`The template method ${name}() is not supported locally.`);
  }
}

function splitArgs(args: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const char of args) {
    if (quote) {
      current += char;
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result;
}

function truthy(value: TemplateValue | undefined): boolean {
  return value !== null && value !== undefined && value !== false && value !== '';
}

class TemplateParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parseBlock(stops: string[]): { nodes: Node[]; stop: string | null; condition: string } {
    const nodes: Node[] = [];
    let text = '';
    const flush = () => {
      if (text) {
        nodes.push({ kind: 'text', text });
        text = '';
      }
    };

    while (this.index < this.source.length) {
      const rest = this.source.slice(this.index);

      if (rest.startsWith('##')) {
        const end = this.source.indexOf('\n', this.index);
        this.index = end === -1 ? this.source.length : end + 1;
        continue;
      }

      const directive = /^#\{?(if|elseif|else|end|set)\}?/.exec(rest);
      if (directive) {
        const name = directive[1];
        if (stops.includes(name)) {
          flush();
          this.index += directive[0].length;
          const condition = name === 'elseif' ? this.readParens() : '';
          return { nodes, stop: name, condition };
        }
        if (name === 'if') {
          flush();
          this.index += directive[0].length;
          nodes.push(this.parseIf(this.readParens()));
          continue;
        }
        if (name === 'set') {
          flush();
          this.index += directive[0].length;
          const body = this.readParens();
          const assignment = /^\s*\$!?\{?([A-Za-z_][\w-]*)\}?\s*=\s*([\s\S]+)$/.exec(body);
          if (!assignment) {
            throw new TemplateError(`Cannot read #set(${body}).`);
          }
          nodes.push({ kind: 'set', name: assignment[1], expression: assignment[2] });
          continue;
        }
        throw new TemplateError(`Unexpected #${name} in the template.`);
      }

      const reference = this.readReference(rest);
      if (reference) {
        flush();
        nodes.push(reference.node);
        this.index += reference.length;
        continue;
      }

      text += this.source[this.index];
      this.index++;
    }

    if (stops.length > 0) {
      throw new TemplateError('The template has an #if without a matching #end.');
    }
    flush();
    return { nodes, stop: null, condition: '' };
  }

  private parseIf(firstCondition: string): Node {
    const branches: { condition: string; body: Node[] }[] = [];
    let condition = firstCondition;
    for (;;) {
      const block = this.parseBlock(['elseif', 'else', 'end']);
      branches.push({ condition, body: block.nodes });
      if (block.stop === 'elseif') {
        condition = block.condition;
        continue;
      }
      if (block.stop === 'else') {
        const otherwise = this.parseBlock(['end']);
        return { kind: 'if', branches, otherwise: otherwise.nodes };
      }
      return { kind: 'if', branches, otherwise: [] };
    }
  }

  private readParens(): string {
    while (this.source[this.index] === ' ') {
      this.index++;
    }
    if (this.source[this.index] !== '(') {
      throw new TemplateError('Expected "(" after a template directive.');
    }
    let depth = 0;
    let quote = '';
    const start = this.index + 1;
    for (; this.index < this.source.length; this.index++) {
      const char = this.source[this.index];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
        if (depth === 0) {
          const body = this.source.slice(start, this.index);
          this.index++;
          return body;
        }
      }
    }
    throw new TemplateError('A template directive is missing its closing ")".');
  }

  private readReference(rest: string): { node: Node; length: number } | null {
    const match = /^\$(!)?(\{)?([A-Za-z_][\w-]*)((?:\.[A-Za-z_]\w*\([^()]*\))*)(\})?/.exec(rest);
    if (!match || (match[2] && !match[5])) {
      return null;
    }
    const methods = [...match[4].matchAll(/\.([A-Za-z_]\w*)\(([^()]*)\)/g)].map((item) => ({
      name: item[1],
      args: item[2],
    }));
    return {
      node: {
        kind: 'ref',
        raw: match[0],
        ref: { name: match[3], quiet: !!match[1], methods },
      },
      length: match[0].length,
    };
  }
}

/** Expressions inside #if and #set: a tiny precedence-climbing parser. */
function evaluateExpression(source: string, scope: TemplateVars): TemplateValue {
  const tokens = tokenizeExpression(source);
  let position = 0;

  const peek = () => tokens[position];
  const next = () => tokens[position++];

  const primary = (): TemplateValue => {
    const token = next();
    if (token === undefined) {
      throw new TemplateError(`Incomplete expression "${source}".`);
    }
    if (token === '(') {
      const value = or();
      next();
      return value;
    }
    if (token === '!' || token === 'not') {
      return !truthy(primary());
    }
    if (token.startsWith('"') || token.startsWith("'")) {
      return token.slice(1, -1);
    }
    if (/^-?\d+(\.\d+)?$/.test(token)) {
      return Number(token);
    }
    if (token === 'true' || token === 'false') {
      return token === 'true';
    }
    if (token === 'null') {
      return null;
    }
    if (token.startsWith('$')) {
      const match = /^\$!?\{?([A-Za-z_][\w-]*)\}?((?:\.[A-Za-z_]\w*\([^()]*\))*)$/.exec(token);
      if (!match) {
        throw new TemplateError(`Cannot read "${token}".`);
      }
      const methods = [...match[2].matchAll(/\.([A-Za-z_]\w*)\(([^()]*)\)/g)].map((item) => ({
        name: item[1],
        args: item[2],
      }));
      return resolveReference({ name: match[1], quiet: true, methods }, scope) ?? null;
    }
    throw new TemplateError(`Unexpected "${token}" in "${source}".`);
  };

  const comparison = (): TemplateValue => {
    const left = primary();
    const operator = peek();
    if (operator && ['==', '!=', '<', '>', '<=', '>=', 'eq', 'ne', 'lt', 'gt', 'le', 'ge'].includes(operator)) {
      next();
      const right = primary();
      return compare(left, operator, right);
    }
    return left;
  };

  const and = (): TemplateValue => {
    let value = comparison();
    while (peek() === '&&' || peek() === 'and') {
      next();
      const right = comparison();
      value = truthy(value) && truthy(right);
    }
    return value;
  };

  function or(): TemplateValue {
    let value = and();
    while (peek() === '||' || peek() === 'or') {
      next();
      const right = and();
      value = truthy(value) || truthy(right);
    }
    return value;
  }

  const result = or();
  if (position < tokens.length) {
    throw new TemplateError(`Unexpected "${tokens[position]}" in "${source}".`);
  }
  return result;
}

function compare(left: TemplateValue, operator: string, right: TemplateValue): boolean {
  const bothNumbers =
    left !== null && right !== null && left !== '' && right !== '' &&
    !Number.isNaN(Number(left)) && !Number.isNaN(Number(right));
  const a = bothNumbers ? Number(left) : left === null ? null : String(left);
  const b = bothNumbers ? Number(right) : right === null ? null : String(right);
  switch (operator) {
    case '==':
    case 'eq':
      return a === b;
    case '!=':
    case 'ne':
      return a !== b;
    case '<':
    case 'lt':
      return a !== null && b !== null && a < b;
    case '>':
    case 'gt':
      return a !== null && b !== null && a > b;
    case '<=':
    case 'le':
      return a !== null && b !== null && a <= b;
    default:
      return a !== null && b !== null && a >= b;
  }
}

function tokenizeExpression(source: string): string[] {
  const pattern =
    /\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\$!?\{?[A-Za-z_][\w-]*\}?(?:\.[A-Za-z_]\w*\([^()]*\))*|==|!=|<=|>=|&&|\|\||[()!<>]|-?\d+(?:\.\d+)?|[A-Za-z_]\w*)/y;
  const tokens: string[] = [];
  let end = 0;
  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while (end < source.length && (match = pattern.exec(source)) !== null) {
    tokens.push(match[1]);
    end = pattern.lastIndex;
  }
  if (source.slice(end).trim() !== '') {
    throw new TemplateError(`Cannot read the expression "${source}".`);
  }
  return tokens;
}
