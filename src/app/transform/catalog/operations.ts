export interface OperationInfo {
  type: string;
  label: string;
  description: string;
  consumesInput: boolean;
}

const OPERATIONS: OperationInfo[] = [
  {
    type: 'accountAttribute',
    label: 'Account Attribute',
    description: 'Look up an account for a particular source on an identity.',
    consumesInput: false,
  },
  {
    type: 'base64Decode',
    label: 'Base64 Decode',
    description: 'Render base64 data in its original binary format.',
    consumesInput: true,
  },
  {
    type: 'base64Encode',
    label: 'Base64 Encode',
    description: 'Encode data with a Base64-based text encoding scheme.',
    consumesInput: true,
  },
  {
    type: 'concat',
    label: 'Concatenation',
    description: 'Join two or more string values into a combined output.',
    consumesInput: false,
  },
  {
    type: 'conditional',
    label: 'Conditional',
    description: 'Output different values depending on simple conditional logic.',
    consumesInput: false,
  },
  {
    type: 'dateCompare',
    label: 'Date Compare',
    description: 'Compare two dates and return a calculated value.',
    consumesInput: false,
  },
  {
    type: 'dateFormat',
    label: 'Date Format',
    description: 'Convert datetime strings from one format to another.',
    consumesInput: true,
  },
  {
    type: 'dateMath',
    label: 'Date Math',
    description: "Add, subtract, and round components of a timestamp's incoming value.",
    consumesInput: true,
  },
  {
    type: 'decomposeDiacriticalMarks',
    label: 'Decompose Diacritical Marks',
    description: 'Clean or standardize symbols used within language.',
    consumesInput: true,
  },
  {
    type: 'displayName',
    label: 'Display Name',
    description: 'Use Preferred Name over Given Name to create an identity’s display name.',
    consumesInput: false,
  },
  {
    type: 'e164phone',
    label: 'E.164 Phone',
    description: 'Convert a phone number string into an E.164-compatible number.',
    consumesInput: true,
  },
  {
    type: 'firstValid',
    label: 'First Valid',
    description: 'Return the first piece of data that is not null.',
    consumesInput: false,
  },
  {
    type: 'identityAttribute',
    label: 'Identity Attribute',
    description: "Get a user's identity attribute value.",
    consumesInput: false,
  },
  {
    type: 'indexOf',
    label: 'Index Of',
    description: 'Get the location of a specific substring within a value.',
    consumesInput: true,
  },
  {
    type: 'iso3166',
    label: 'ISO3166',
    description: 'Convert a string into an ISO 3166 country code value.',
    consumesInput: true,
  },
  {
    type: 'join',
    label: 'Join',
    description: 'Join two or more string values into a combined output with a defined separator.',
    consumesInput: false,
  },
  {
    type: 'lastIndexOf',
    label: 'Last Index Of',
    description: 'Return the last location of a specific substring.',
    consumesInput: true,
  },
  {
    type: 'leftPad',
    label: 'Left Pad',
    description: 'Pad the left side of the input string.',
    consumesInput: true,
  },
  {
    type: 'lookup',
    label: 'Lookup',
    description: "Look up and return a key's matching value.",
    consumesInput: true,
  },
  {
    type: 'lower',
    label: 'Lower',
    description: 'Convert an input string into all lowercase letters.',
    consumesInput: true,
  },
  {
    type: 'normalizeNames',
    label: 'Name Normalizer',
    description: 'Clean or standardize the spelling of strings coming in from source systems.',
    consumesInput: true,
  },
  {
    type: 'randomAlphaNumeric',
    label: 'Random Alphanumeric',
    description: 'Generate a random string of any length.',
    consumesInput: false,
  },
  {
    type: 'randomNumeric',
    label: 'Random Numeric',
    description: 'Generate a random number of any length.',
    consumesInput: false,
  },
  {
    type: 'reference',
    label: 'Reference',
    description: 'Reuse a transform that has already been written. The reference is not expanded.',
    consumesInput: false,
  },
  {
    type: 'replace',
    label: 'Replace',
    description: 'Find and replace all instances of a single string.',
    consumesInput: true,
  },
  {
    type: 'replaceAll',
    label: 'Replace All',
    description: 'Find and replace all instances of all patterns.',
    consumesInput: true,
  },
  {
    type: 'rfc5646',
    label: 'RFC5646',
    description: 'Convert a three-letter abbreviation to an RFC5646 language tag.',
    consumesInput: true,
  },
  {
    type: 'rightPad',
    label: 'Right Pad',
    description: 'Add padding to the right of an incoming string.',
    consumesInput: true,
  },
  {
    type: 'rule',
    label: 'Rule',
    description: 'Reuse rule logic that has already been written for a previous use case.',
    consumesInput: true,
  },
  {
    type: 'split',
    label: 'Split',
    description: 'Return the Nth element of a split array.',
    consumesInput: true,
  },
  {
    type: 'static',
    label: 'Static',
    description: 'Return a fixed string value, or render a Velocity template.',
    consumesInput: false,
  },
  {
    type: 'substring',
    label: 'Substring',
    description: 'Get the inner portion of a string passed into the transform.',
    consumesInput: true,
  },
  {
    type: 'trim',
    label: 'Trim',
    description: 'Trim whitespaces from both the beginning and ending of input strings.',
    consumesInput: true,
  },
  {
    type: 'upper',
    label: 'Upper',
    description: 'Convert an input string into all uppercase letters.',
    consumesInput: true,
  },
  {
    type: 'usernameGenerator',
    label: 'Username Generator',
    description: 'Derive a unique value for an attribute in an account create profile.',
    consumesInput: false,
  },
  {
    type: 'uuid',
    label: 'UUID Generator',
    description: 'Create a universal unique ID (UUID).',
    consumesInput: false,
  },
];

const BY_TYPE = new Map(OPERATIONS.map((operation) => [operation.type, operation]));

export function lookupOperation(type: string): OperationInfo | undefined {
  return BY_TYPE.get(type);
}
