import { TestBed } from '@angular/core/testing';
import { ClassicPreset } from 'rete';
import { ARROW_PICK_EVENT, FlowConnection, valueSocket } from './flow-node';
import { TransformConnectionComponent } from './transform-connection.component';

describe('TransformConnectionComponent', () => {
  function render(setup: (connection: FlowConnection) => void) {
    const source = new ClassicPreset.Node('Source');
    source.addOutput('out', new ClassicPreset.Output(valueSocket));
    const target = new ClassicPreset.Node('Target');
    target.addInput('value', new ClassicPreset.Input(valueSocket));
    const connection = new FlowConnection(source, target, 'value', 'Value');
    setup(connection);
    const fixture = TestBed.createComponent(TransformConnectionComponent);
    fixture.componentInstance.data = connection;
    fixture.componentInstance.start = { x: 0, y: 0 };
    fixture.componentInstance.end = { x: 200, y: 40 };
    fixture.detectChanges();
    return { connection, element: fixture.nativeElement as HTMLElement, fixture };
  }

  it('should announce a click on a selectable arrow', () => {
    const { connection, element } = render((item) => (item.selectable = true));
    const picked: string[] = [];
    element.addEventListener(ARROW_PICK_EVENT, (event) =>
      picked.push((event as CustomEvent<string>).detail),
    );
    element
      .querySelector('[data-testid="connection-hit"]')
      ?.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(picked).toEqual([connection.id]);
  });

  it('should highlight the selected arrow', () => {
    const { element } = render((item) => {
      item.selectable = true;
      item.selected = true;
    });
    expect(element.querySelector('svg')?.classList.contains('selected')).toBe(true);
    expect(element.querySelector('[data-testid="connection-glow"]')).not.toBeNull();
  });

  it('should only show the glow on the selected arrow', () => {
    const { element } = render((item) => (item.selectable = true));
    expect(element.querySelector('[data-testid="connection-glow"]')).toBeNull();
  });

  it('should not let a variable arrow be picked', () => {
    const { element } = render((item) => (item.reference = true));
    expect(element.querySelector('[data-testid="connection-hit"]')).toBeNull();
  });
});
