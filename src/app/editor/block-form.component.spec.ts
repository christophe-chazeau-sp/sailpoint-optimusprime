import { TestBed } from '@angular/core/testing';
import { allBlocks } from '../transform/catalog/blocks';
import { TransformObject } from '../transform/workspace/workspace';
import { BlockFormComponent } from './block-form.component';

async function open(
  type: string,
  value: TransformObject | null = null,
  arrow?: { slot: string | null },
) {
  await TestBed.configureTestingModule({ imports: [BlockFormComponent] }).compileComponents();
  const fixture = TestBed.createComponent(BlockFormComponent);
  fixture.componentInstance.type = type;
  fixture.componentInstance.value = value;
  fixture.componentInstance.onArrow = arrow !== undefined;
  fixture.componentInstance.arrowSlot = arrow?.slot ?? null;
  const saved: TransformObject[] = [];
  fixture.componentInstance.save.subscribe((block) => saved.push(block));
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const type_ = (field: string, text: string) => {
    const input = element.querySelector(`[data-field="${field}"]`) as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
  };
  const submit = () => {
    (element.querySelector('[data-testid="block-form-submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
  };
  return { element, saved, type: type_, submit };
}

describe('BlockFormComponent', () => {
  it('saves a typed input as a plain value', async () => {
    const form = await open('iso3166');
    form.type('input', 'fr');
    form.submit();
    expect(form.saved[0]).toEqual({ type: 'iso3166', attributes: { input: 'fr' } });
  });

  it('leaves the input out when it is empty, so the step reads the implicit input', async () => {
    const form = await open('lower');
    expect(form.element.textContent).toContain('Left empty, the step reads the attribute the identity profile maps it to.');
    form.submit();
    expect(form.saved[0]).toEqual({ type: 'lower', attributes: {} });
  });

  it('keeps a block plugged into the input', async () => {
    const plugged = { type: 'identityAttribute', attributes: { name: 'country' } };
    const form = await open('iso3166', { type: 'iso3166', attributes: { format: 'alpha3', input: plugged } });
    expect(form.element.querySelector('[data-field="input"]')).toBeNull();
    expect(form.element.textContent).toContain('Identity Attribute block');
    form.submit();
    expect(form.saved[0]['attributes']).toEqual({ format: 'alpha3', input: plugged });
  });

  it('does not ask for the input an arrow will fill', async () => {
    const form = await open('iso3166', null, { slot: 'input' });
    expect(form.element.querySelector('[data-field="input"]')).toBeNull();
    expect(form.element.querySelector('[data-testid="arrow-slot"]')?.textContent).toContain('From the arrow');
    form.submit();
    expect(form.saved[0]).toEqual({ type: 'iso3166', attributes: {} });
  });

  it('still asks for the other inputs of a block dropped on an arrow', async () => {
    const form = await open('dateCompare', null, { slot: 'firstDate' });
    expect(form.element.querySelector('[data-field="firstDate"]')).toBeNull();
    expect(form.element.querySelector('[data-field="secondDate"]')).not.toBeNull();
  });

  it('warns when a block dropped on an arrow has no input for it', async () => {
    const form = await open('uuid', null, { slot: null });
    expect(form.element.querySelector('[data-testid="arrow-note"]')).not.toBeNull();
  });

  it('offers a typed input on every block that reads one', () => {
    const withInput = allBlocks().filter((block) => block.operation.consumesInput || block.type === 'reference');
    expect(withInput.length).toBeGreaterThan(20);
    for (const block of withInput) {
      expect({ type: block.type, literal: block.slots.find((slot) => slot.key === 'input')?.literal }).toEqual({
        type: block.type,
        literal: true,
      });
    }
  });
});
