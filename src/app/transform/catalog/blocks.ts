import { lookupOperation, OperationInfo } from './operations';

export type FieldKind = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'json';

/** A plain configuration attribute, edited in the block form. */
export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** Fixed choices for a select. */
  options?: string[];
  /** Common values offered while typing; any other value is still accepted. */
  suggestions?: string[];
  placeholder?: string;
  help?: string;
  /** For json fields: the JSON shape the attribute must have. */
  shape?: 'object' | 'array';
}

/** An attribute that can hold another block. */
export interface SlotSpec {
  key: string;
  /** Holds a list of values, like concat's `values`. */
  multiple?: boolean;
  /** A plain value can sit in the slot instead of a block. */
  literal?: boolean;
  required?: boolean;
  /** Leaving the slot empty makes the step read the identity profile's attribute. */
  implicit?: boolean;
  placeholder?: string;
}

export type BlockGroup = 'Sources' | 'Text' | 'Dates' | 'Logic' | 'Formats' | 'Generators';

export const BLOCK_GROUPS: BlockGroup[] = ['Sources', 'Text', 'Dates', 'Logic', 'Formats', 'Generators'];

export interface BlockSpec {
  type: string;
  group: BlockGroup;
  fields: FieldSpec[];
  slots: SlotSpec[];
  /** Other attribute names declare variables, which Velocity text in the step can read. */
  variables?: boolean;
}

export interface BlockInfo extends BlockSpec {
  operation: OperationInfo;
}

const INPUT: SlotSpec = { key: 'input', implicit: true };

const DATE_FORMATS = ['ISO8601', 'LDAP', 'PEOPLE_SOFT', 'EPOCH_TIME_JAVA', 'EPOCH_TIME_WIN32'];

const SPECS: BlockSpec[] = [
  {
    type: 'accountAttribute',
    group: 'Sources',
    fields: [
      { key: 'sourceName', label: 'Source name', kind: 'text', required: true, placeholder: 'HR Source' },
      { key: 'attributeName', label: 'Attribute name', kind: 'text', required: true, placeholder: 'department' },
      { key: 'accountSortAttribute', label: 'Sort accounts by', kind: 'text', placeholder: 'created' },
      { key: 'accountSortDescending', label: 'Sort descending', kind: 'boolean' },
      { key: 'accountReturnFirstLink', label: 'Return the first account', kind: 'boolean' },
      { key: 'accountFilter', label: 'Account filter', kind: 'text', placeholder: '!(nativeIdentity.startsWith("*DELETED*"))' },
      { key: 'accountPropertyFilter', label: 'Account property filter', kind: 'text', placeholder: '(application.name == "Active Directory")' },
    ],
    slots: [],
  },
  { type: 'identityAttribute', group: 'Sources', fields: [{ key: 'name', label: 'Identity attribute', kind: 'text', required: true, placeholder: 'email' }], slots: [] },
  {
    type: 'static',
    group: 'Sources',
    fields: [{ key: 'value', label: 'Value', kind: 'textarea', required: true, help: 'Fixed text, or a Velocity template such as $firstName.$lastName' }],
    slots: [],
    variables: true,
  },
  {
    type: 'reference',
    group: 'Sources',
    fields: [{ key: 'id', label: 'Transform name', kind: 'text', required: true, help: 'Name of the existing transform to reuse.' }],
    slots: [{ key: 'input' }],
  },
  {
    type: 'rule',
    group: 'Sources',
    fields: [
      { key: 'name', label: 'Rule name', kind: 'text', required: true },
      { key: 'operation', label: 'Operation', kind: 'text', help: 'Only for the generic Cloud Services Deployment Utility rule.' },
    ],
    slots: [INPUT],
  },
  { type: 'displayName', group: 'Sources', fields: [], slots: [] },

  { type: 'concat', group: 'Text', fields: [], slots: [{ key: 'values', multiple: true, literal: true, required: true }] },
  {
    type: 'join',
    group: 'Text',
    fields: [{ key: 'separator', label: 'Separator', kind: 'text', placeholder: ',' }],
    slots: [{ key: 'values', multiple: true, literal: true, required: true }],
  },
  { type: 'lower', group: 'Text', fields: [], slots: [INPUT] },
  { type: 'upper', group: 'Text', fields: [], slots: [INPUT] },
  { type: 'trim', group: 'Text', fields: [], slots: [INPUT] },
  {
    type: 'substring',
    group: 'Text',
    fields: [
      { key: 'begin', label: 'Begin', kind: 'number', required: true, help: 'Index of the first character, or -1 for the start.' },
      { key: 'beginOffset', label: 'Begin offset', kind: 'number' },
      { key: 'end', label: 'End', kind: 'number', help: 'Index after the last character, or -1 for the end.' },
      { key: 'endOffset', label: 'End offset', kind: 'number' },
    ],
    slots: [INPUT],
  },
  {
    type: 'replace',
    group: 'Text',
    fields: [
      { key: 'regex', label: 'Pattern (regex)', kind: 'text', required: true },
      { key: 'replacement', label: 'Replacement', kind: 'text', required: true },
    ],
    slots: [INPUT],
  },
  {
    type: 'replaceAll',
    group: 'Text',
    fields: [{ key: 'table', label: 'Replacements', kind: 'json', shape: 'object', required: true, placeholder: '{\n  "-": " ",\n  "\\\\.": ""\n}', help: 'Each key is a pattern and each value its replacement.' }],
    slots: [INPUT],
  },
  {
    type: 'leftPad',
    group: 'Text',
    fields: [
      { key: 'length', label: 'Length', kind: 'text', required: true, placeholder: '8' },
      { key: 'padding', label: 'Padding character', kind: 'text', placeholder: '0' },
    ],
    slots: [INPUT],
  },
  {
    type: 'rightPad',
    group: 'Text',
    fields: [
      { key: 'length', label: 'Length', kind: 'text', required: true, placeholder: '8' },
      { key: 'padding', label: 'Padding character', kind: 'text', placeholder: '0' },
    ],
    slots: [INPUT],
  },
  {
    type: 'split',
    group: 'Text',
    fields: [
      { key: 'delimiter', label: 'Delimiter (regex)', kind: 'text', required: true, placeholder: ',' },
      { key: 'index', label: 'Index', kind: 'number', required: true, placeholder: '0' },
      { key: 'throws', label: 'Fail when the index is out of range', kind: 'boolean' },
    ],
    slots: [INPUT],
  },
  { type: 'indexOf', group: 'Text', fields: [{ key: 'substring', label: 'Text to find', kind: 'text', required: true }], slots: [INPUT] },
  { type: 'lastIndexOf', group: 'Text', fields: [{ key: 'substring', label: 'Text to find', kind: 'text', required: true }], slots: [INPUT] },
  {
    type: 'lookup',
    group: 'Text',
    fields: [{ key: 'table', label: 'Table', kind: 'json', shape: 'object', required: true, placeholder: '{\n  "US": "United States",\n  "default": "Unknown"\n}', help: 'Keys to look up and the value each returns. A "default" key catches the rest.' }],
    slots: [INPUT],
  },
  { type: 'base64Encode', group: 'Text', fields: [], slots: [INPUT] },
  { type: 'base64Decode', group: 'Text', fields: [], slots: [INPUT] },
  { type: 'decomposeDiacriticalMarks', group: 'Text', fields: [], slots: [INPUT] },
  { type: 'normalizeNames', group: 'Text', fields: [], slots: [INPUT] },

  {
    type: 'dateFormat',
    group: 'Dates',
    fields: [
      { key: 'inputFormat', label: 'Input format', kind: 'text', suggestions: DATE_FORMATS, placeholder: 'ISO8601' },
      { key: 'outputFormat', label: 'Output format', kind: 'text', suggestions: DATE_FORMATS, placeholder: 'ISO8601' },
    ],
    slots: [INPUT],
  },
  {
    type: 'dateMath',
    group: 'Dates',
    fields: [
      { key: 'expression', label: 'Expression', kind: 'text', required: true, placeholder: 'now+1d', help: 'Use y M w d h m s, with + - and / to round, for example now-5d/d.' },
      { key: 'roundUp', label: 'Round up', kind: 'boolean' },
    ],
    slots: [INPUT],
  },
  {
    type: 'dateCompare',
    group: 'Dates',
    fields: [
      { key: 'operator', label: 'Operator', kind: 'select', required: true, options: ['LT', 'LTE', 'GT', 'GTE'] },
      { key: 'positiveCondition', label: 'Value when true', kind: 'text', required: true },
      { key: 'negativeCondition', label: 'Value when false', kind: 'text', required: true },
    ],
    slots: [
      { key: 'firstDate', literal: true, required: true, placeholder: 'now' },
      { key: 'secondDate', literal: true, required: true, placeholder: 'now' },
    ],
  },

  {
    type: 'firstValid',
    group: 'Logic',
    fields: [{ key: 'ignoreErrors', label: 'Skip values that fail', kind: 'boolean' }],
    slots: [{ key: 'values', multiple: true, literal: true, required: true }],
  },
  {
    type: 'conditional',
    group: 'Logic',
    fields: [{ key: 'expression', label: 'Expression', kind: 'text', required: true, placeholder: '$department eq Engineering', help: 'Compare with eq, for example $department eq Engineering.' }],
    slots: [
      { key: 'positiveCondition', literal: true, required: true },
      { key: 'negativeCondition', literal: true, required: true },
    ],
    variables: true,
  },

  { type: 'e164phone', group: 'Formats', fields: [{ key: 'defaultRegion', label: 'Default region', kind: 'text', placeholder: 'US' }], slots: [INPUT] },
  { type: 'iso3166', group: 'Formats', fields: [{ key: 'format', label: 'Format', kind: 'select', options: ['alpha2', 'alpha3', 'numeric'] }], slots: [INPUT] },
  { type: 'rfc5646', group: 'Formats', fields: [], slots: [INPUT] },

  {
    type: 'usernameGenerator',
    group: 'Generators',
    fields: [
      { key: 'patterns', label: 'Patterns', kind: 'json', shape: 'array', required: true, placeholder: '[\n  "$fn.$ln",\n  "$fn.$ln${uniqueCounter}"\n]' },
      { key: 'sourceCheck', label: 'Check the target source', kind: 'boolean' },
      { key: 'cloudMaxSize', label: 'Maximum length', kind: 'number' },
      { key: 'cloudMaxUniqueChecks', label: 'Maximum unique checks', kind: 'number' },
      { key: 'cloudRequired', label: 'Required', kind: 'boolean' },
    ],
    slots: [],
    variables: true,
  },
  { type: 'uuid', group: 'Generators', fields: [], slots: [] },
  { type: 'randomAlphaNumeric', group: 'Generators', fields: [{ key: 'length', label: 'Length', kind: 'text', placeholder: '32' }], slots: [] },
  { type: 'randomNumeric', group: 'Generators', fields: [{ key: 'length', label: 'Length', kind: 'text', placeholder: '10' }], slots: [] },
];

const BY_TYPE = new Map<string, BlockInfo>();
for (const spec of SPECS) {
  const operation = lookupOperation(spec.type);
  if (operation) {
    BY_TYPE.set(spec.type, { ...spec, operation });
  }
}

export function blockInfo(type: string): BlockInfo | undefined {
  return BY_TYPE.get(type);
}

export function allBlocks(): BlockInfo[] {
  return [...BY_TYPE.values()];
}

/** Attribute names the spec already accounts for; on a variables block, anything else is a variable. */
export function knownAttributes(info: BlockSpec): Set<string> {
  return new Set([...info.fields.map((field) => field.key), ...info.slots.map((slot) => slot.key)]);
}
