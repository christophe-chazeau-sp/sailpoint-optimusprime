import { AfterViewInit, Component, ElementRef, Input, OnInit, output } from '@angular/core';
import { blockInfo, BlockInfo, FieldSpec, knownAttributes, SlotSpec } from '../transform/catalog/blocks';
import { lookupOperation } from '../transform/catalog/operations';
import { isRecord, isTransform, TransformObject } from '../transform/workspace/workspace';

interface FieldState {
  spec: FieldSpec;
  text: string;
  checked: boolean;
  error?: string;
}

/** A value inside a slot: plain text typed here, or a block plugged in on the canvas. */
type SlotValue = { kind: 'literal'; text: string; original?: unknown } | { kind: 'block'; value: unknown; label: string };

interface SlotState {
  spec: SlotSpec;
  single: SlotValue;
  items: SlotValue[];
  error?: string;
}

interface VariableState {
  name: string;
  value: SlotValue;
  error?: string;
}

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function blockLabel(value: unknown): string {
  const type = isTransform(value) ? String(value['type']) : '';
  return lookupOperation(type)?.label ?? type;
}

function toSlotValue(value: unknown): SlotValue {
  if (isTransform(value)) {
    return { kind: 'block', value, label: blockLabel(value) };
  }
  if (value === undefined || value === null) {
    return { kind: 'literal', text: '' };
  }
  return { kind: 'literal', text: typeof value === 'string' ? value : JSON.stringify(value), original: value };
}

function fromSlotValue(value: SlotValue): unknown {
  if (value.kind === 'block') {
    return value.value;
  }
  const original = value.original;
  if (original !== undefined && typeof original !== 'string' && JSON.stringify(original) === value.text) {
    return original;
  }
  return value.text;
}

function isEmpty(value: SlotValue): boolean {
  return value.kind === 'literal' && value.text.trim() === '';
}

/**
 * Asks for a block's attributes when it is added, and edits them later. Blocks plugged in on the
 * canvas show as chips; plain values are typed here. Attributes the form does not know are kept.
 */
@Component({
  selector: 'app-block-form',
  templateUrl: './block-form.component.html',
  styleUrl: './block-form.component.scss',
  host: { '(keydown.escape)': 'cancel.emit()' },
})
export class BlockFormComponent implements OnInit, AfterViewInit {
  @Input({ required: true }) type!: string;
  /** The block being edited; null when adding a new one. */
  @Input() value: TransformObject | null = null;
  /** Editing the transform's output block also edits the transform name. */
  @Input() isRoot = false;

  readonly save = output<TransformObject>();
  readonly cancel = output<void>();

  protected info: BlockInfo | undefined;
  protected fields: FieldState[] = [];
  protected slots: SlotState[] = [];
  protected variables: VariableState[] = [];
  protected name = '';
  protected nameError = '';
  protected formError = '';

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  protected get title(): string {
    const label = this.info?.operation.label ?? this.type;
    return this.value ? `Edit ${label}` : `Add ${label}`;
  }

  protected get editableSlots(): SlotState[] {
    return this.slots.filter((slot) => slot.spec.literal || slot.spec.multiple);
  }

  protected get implicitSlot(): SlotSpec | undefined {
    return this.info?.slots.find((slot) => !slot.literal && !slot.multiple);
  }

  ngOnInit(): void {
    this.info = blockInfo(this.type);
    const attributes = isRecord(this.value?.['attributes']) ? (this.value['attributes'] as TransformObject) : {};
    this.name = typeof this.value?.['name'] === 'string' ? (this.value['name'] as string) : '';
    this.fields = (this.info?.fields ?? []).map((spec) => {
      const current = attributes[spec.key];
      let text = '';
      if (spec.kind === 'json') {
        text = current === undefined ? '' : JSON.stringify(current, null, 2);
      } else if (current !== undefined && current !== null) {
        text = typeof current === 'string' ? current : JSON.stringify(current);
      }
      return { spec, text, checked: current === true || current === 'true' };
    });
    this.slots = (this.info?.slots ?? []).map((spec) => {
      const current = attributes[spec.key];
      return {
        spec,
        single: toSlotValue(Array.isArray(current) ? undefined : current),
        items: Array.isArray(current) ? current.map(toSlotValue) : spec.multiple && !this.value ? [toSlotValue('')] : [],
      };
    });
    if (this.info?.variables) {
      const known = knownAttributes(this.info);
      this.variables = Object.entries(attributes)
        .filter(([key]) => !known.has(key))
        .map(([name, value]) => ({ name, value: toSlotValue(value) }));
    }
  }

  ngAfterViewInit(): void {
    const first = this.host.nativeElement.querySelector<HTMLElement>('input:not([type=checkbox]), textarea, select');
    (first ?? this.host.nativeElement.querySelector<HTMLElement>('button[type=submit]'))?.focus();
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setLiteral(target: SlotValue, event: Event): void {
    if (target.kind === 'literal') {
      target.text = this.text(event);
    }
  }

  protected addItem(slot: SlotState): void {
    slot.items = [...slot.items, toSlotValue('')];
  }

  protected removeItem(slot: SlotState, index: number): void {
    slot.items = slot.items.filter((_, position) => position !== index);
  }

  protected addVariable(): void {
    this.variables = [...this.variables, { name: '', value: toSlotValue('') }];
  }

  protected removeVariable(index: number): void {
    this.variables = this.variables.filter((_, position) => position !== index);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const result = this.build();
    if (result) {
      this.save.emit(result);
    }
  }

  private build(): TransformObject | null {
    let valid = true;
    const previous = isRecord(this.value?.['attributes']) ? (this.value['attributes'] as TransformObject) : {};
    const next: TransformObject = {};
    const known = this.info ? knownAttributes(this.info) : new Set<string>();

    for (const field of this.fields) {
      field.error = undefined;
      const { spec } = field;
      if (spec.kind === 'boolean') {
        if (field.checked || spec.key in previous) {
          next[spec.key] = field.checked;
        }
        continue;
      }
      const text = field.text;
      if (!text.trim()) {
        if (spec.required) {
          field.error = 'Required.';
          valid = false;
        }
        continue;
      }
      if (spec.kind === 'number') {
        const number = Number(text);
        if (!Number.isFinite(number)) {
          field.error = 'Enter a number.';
          valid = false;
          continue;
        }
        next[spec.key] = number;
      } else if (spec.kind === 'json') {
        try {
          const parsed: unknown = JSON.parse(text);
          if (spec.shape === 'array' ? !Array.isArray(parsed) : spec.shape === 'object' && !isRecord(parsed)) {
            field.error = spec.shape === 'array' ? 'Enter a JSON list, like ["a", "b"].' : 'Enter a JSON object, like {"a": "b"}.';
            valid = false;
            continue;
          }
          next[spec.key] = parsed;
        } catch {
          field.error = 'This is not valid JSON.';
          valid = false;
          continue;
        }
      } else {
        next[spec.key] = text;
      }
    }

    for (const slot of this.slots) {
      slot.error = undefined;
      const { spec } = slot;
      if (spec.multiple) {
        const items = slot.items.filter((item) => !isEmpty(item)).map(fromSlotValue);
        if (items.length > 0 || spec.key in previous) {
          next[spec.key] = items;
        }
        if (spec.required && items.length === 0) {
          slot.error = 'Add at least one value, or connect blocks to it on the canvas afterwards.';
          if (this.value) {
            valid = false;
          }
        }
      } else if (spec.literal) {
        if (!isEmpty(slot.single)) {
          next[spec.key] = fromSlotValue(slot.single);
        } else if (spec.required && this.value) {
          slot.error = 'Required. Type a value, or connect a block to it on the canvas.';
          valid = false;
        }
      } else if (spec.key in previous) {
        next[spec.key] = previous[spec.key];
      }
    }

    const names = new Set<string>();
    for (const variable of this.variables) {
      variable.error = undefined;
      const name = variable.name.trim();
      if (!name && isEmpty(variable.value)) {
        continue;
      }
      if (!NAME_PATTERN.test(name)) {
        variable.error = 'Use letters, digits and underscores, starting with a letter.';
      } else if (known.has(name) || names.has(name)) {
        variable.error = 'This name is already used.';
      }
      if (variable.error) {
        valid = false;
        continue;
      }
      names.add(name);
      next[name] = fromSlotValue(variable.value);
    }

    if (!this.info?.variables) {
      for (const [key, item] of Object.entries(previous)) {
        if (!known.has(key)) {
          next[key] = item;
        }
      }
    }

    this.nameError = '';
    if (this.isRoot && !this.name.trim()) {
      this.nameError = 'The transform needs a name.';
      valid = false;
    }
    this.formError = valid ? '' : 'Some values need fixing.';
    if (!valid) {
      return null;
    }

    const ordered: TransformObject = {};
    for (const key of Object.keys(previous)) {
      if (key in next) {
        ordered[key] = next[key];
      }
    }
    for (const [key, item] of Object.entries(next)) {
      if (!(key in ordered)) {
        ordered[key] = item;
      }
    }

    const block: TransformObject = this.value ? { ...this.value } : {};
    if (this.isRoot) {
      block['name'] = this.name.trim();
    }
    block['type'] = this.type;
    block['attributes'] = ordered;
    return block;
  }
}
