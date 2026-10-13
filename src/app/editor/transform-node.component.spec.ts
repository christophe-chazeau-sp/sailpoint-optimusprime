import { TestBed } from '@angular/core/testing';
import { FlowNode, LITERAL_EDIT_EVENT, LiteralEditDetail } from './flow-node';
import { TransformNodeComponent } from './transform-node.component';

describe('TransformNodeComponent', () => {
  function render(editText?: string) {
    const node = new FlowNode(
      {
        id: 'lit',
        kind: 'literal',
        type: 'literal',
        label: 'Literal',
        summary: '"Foo"',
        attributes: [{ key: 'value', value: '"Foo"' }],
        unknownType: false,
      },
      { category: 'Literal', tone: 'neutral', title: '"Foo"' } as FlowNode['view'],
    );
    node.capsule = 'literal';
    node.caption = '"Foo"';
    node.editText = editText;
    const fixture = TestBed.createComponent(TransformNodeComponent);
    fixture.componentInstance.data = node;
    fixture.componentInstance.emit = () => undefined;
    fixture.componentInstance.ngOnChanges();
    const element = fixture.nativeElement as HTMLElement;
    const edits: LiteralEditDetail[] = [];
    element.addEventListener(LITERAL_EDIT_EVENT, (event) =>
      edits.push((event as CustomEvent<LiteralEditDetail>).detail),
    );
    return { element, edits, node };
  }

  it('shows the value as text until it is edited', () => {
    const { element } = render();
    expect(element.querySelector('[data-testid="literal-edit"]')).toBeNull();
    expect(element.querySelector('.title')?.textContent).toContain('"Foo"');
  });

  it('sends the typed text when Enter is pressed', () => {
    const { element, edits, node } = render('Foo');
    const field = element.querySelector('[data-testid="literal-edit"]') as HTMLInputElement;
    expect(field.value).toBe('Foo');
    field.value = 'Bar';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    field.dispatchEvent(new Event('blur'));
    expect(edits).toEqual([{ nodeId: node.id, text: 'Bar' }]);
  });

  it('cancels the edit with Escape', () => {
    const { element, edits, node } = render('Foo');
    const field = element.querySelector('[data-testid="literal-edit"]') as HTMLInputElement;
    field.value = 'Bar';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(edits).toEqual([{ nodeId: node.id, text: null }]);
  });
});
