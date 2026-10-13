import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  App,
  BLANK_EXAMPLE_ID,
  LEFT_PANE_OPEN_KEY,
  LEFT_PANE_WIDTH_KEY,
  PALETTE_OPEN_KEY,
  SOURCE_FOLDED_KEY,
} from './app';
import { PALETTE_COLLAPSED_KEY } from './editor/block-palette.component';
import { TransformCanvasComponent, TRANSFORM_OUTPUT_ID } from './editor/transform-canvas.component';
import { EXPLAIN_OPEN_KEY } from './inspector/explanation-card.component';

describe('App', () => {
  beforeAll(() => {
    // jsdom has no layout; CodeMirror measures text through these when it renders.
    Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  });

  beforeEach(async () => {
    try {
      localStorage.removeItem(LEFT_PANE_WIDTH_KEY);
      localStorage.removeItem(LEFT_PANE_OPEN_KEY);
      localStorage.removeItem(PALETTE_OPEN_KEY);
      localStorage.removeItem(PALETTE_COLLAPSED_KEY);
      localStorage.removeItem(SOURCE_FOLDED_KEY);
      localStorage.removeItem(EXPLAIN_OPEN_KEY);
    } catch {
      // Storage can be unavailable in some test environments.
    }
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should show the transform document in the JSON editor', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Transform');
    expect(compiled.querySelector('.cm-content')?.textContent).toContain('"type"');
  });

  it('should keep the current graph when the JSON is invalid', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const editor = fixture.debugElement.children[0]?.query(
      (element) => element.name === 'app-json-editor',
    );
    editor?.triggerEventHandler('valueChange', '{');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'not valid JSON',
    );
    expect(fixture.nativeElement.querySelector('.inspector-title')?.textContent).toContain('Lower');
  });

  it('should collapse the source pane from its edge button', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const pane = fixture.nativeElement.querySelector('aside.source') as HTMLElement;
    expect(pane.classList.contains('collapsed')).toBe(false);
    (pane.querySelector('button.collapse') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(pane.classList.contains('collapsed')).toBe(true);
    expect(pane.querySelector('app-json-editor')).toBeNull();
  });

  it('should explain the transform and the selected step in plain English', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const summary = () => element.querySelector('[data-testid="explain-summary"]');
    const toggle = () => (element.querySelector('[data-testid="explain-toggle"]') as HTMLButtonElement).click();
    const experimental = element.querySelector('[data-testid="explain-experimental"]') as HTMLElement;
    experimental.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="tooltip"]')?.textContent?.trim()).toBe('Experimental guess');
    experimental.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="tooltip"]')).toBeNull();
    expect(summary()).toBeNull();

    toggle();
    fixture.detectChanges();
    expect(localStorage.getItem(EXPLAIN_OPEN_KEY)).toBe('1');
    expect(summary()?.textContent).toContain('“Lowercase display” returns');
    expect(summary()?.textContent).toContain('in lowercase');
    expect(summary()?.querySelector('.chip')?.textContent).toBe('Bar');
    expect(element.querySelector('[data-testid="step-explanation"]')?.textContent).toContain(
      'Returns the Concatenation result in lowercase.',
    );

    toggle();
    fixture.detectChanges();
    expect(summary()).toBeNull();
    expect(localStorage.getItem(EXPLAIN_OPEN_KEY)).toBe('0');
  });

  it('should flag input values that are still empty', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="missing-badge"]')).toBeNull();

    (element.querySelector('[data-example="implicit-lower"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="missing-badge"]')?.textContent).toContain('1 without a value');
    expect(element.querySelector('app-test-values .missing')).not.toBeNull();
    expect(element.querySelector('[data-testid="tab-values"] .badge.alert')?.textContent).toContain('1 / 1');

    const field = element.querySelector('[data-input]') as HTMLInputElement;
    field.value = 'JOHN';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="missing-badge"]')).toBeNull();
    expect(element.querySelector('app-test-values .missing')).toBeNull();
  });

  it('should lay the source pane out in numbered sections with tabs', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const section = (name: string) => element.querySelector(`[data-section="${name}"]`) as HTMLElement;
    const visible = (selector: string) => {
      const found = element.querySelector(selector);
      return !!found && !found.closest('[hidden]');
    };

    expect(element.querySelector('[data-testid="tenant-strip"]')?.textContent).toContain('Not connected');
    expect(visible('[data-testid="examples"]')).toBe(true);
    expect(visible('input[type="file"]')).toBe(false);

    const tab = (container: HTMLElement, label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((button) =>
        button.textContent?.includes(label),
      )!;
    tab(section('open'), 'File').click();
    fixture.detectChanges();
    expect(visible('input[type="file"]')).toBe(true);
    expect(visible('[data-testid="examples"]')).toBe(false);

    tab(section('open'), 'Tenant').click();
    fixture.detectChanges();
    (element.querySelector('[data-testid="open-sign-in"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="tenant-sign-in"]')).not.toBeNull();

    tab(section('test'), 'Identity').click();
    fixture.detectChanges();
    expect(visible('[data-testid="identity-preview"]')).toBe(true);
    expect(visible('[data-input]')).toBe(false);

    (section('json').querySelector('.head') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(visible('[data-section="json"] app-json-editor')).toBe(false);
    expect(section('json').classList.contains('folded')).toBe(true);
    expect(JSON.parse(localStorage.getItem(SOURCE_FOLDED_KEY) ?? '[]')).toEqual(['json']);
  });

  it('should start with the blocks pane folded, then list folded sections', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector('[data-testid="palette-toggle"]') as HTMLButtonElement;
    expect(element.querySelector('app-block-palette')).toBeNull();
    toggle.click();
    fixture.detectChanges();
    expect(localStorage.getItem(PALETTE_OPEN_KEY)).toBe('1');
    expect(element.querySelectorAll('[data-testid="palette-group"]').length).toBe(6);
    expect(element.querySelectorAll('[data-testid="palette-block"]').length).toBe(0);
    toggle.click();
    fixture.detectChanges();
    expect(element.querySelector('app-block-palette')).toBeNull();
    expect(localStorage.getItem(PALETTE_OPEN_KEY)).toBe('0');
  });

  it('should fold palette sections, and open matching ones while searching', async () => {
    localStorage.setItem(PALETTE_OPEN_KEY, '1');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const textBlocks = () =>
      element.querySelectorAll('[data-testid="palette-group"][data-group="Text"] [data-testid="palette-block"]').length;
    expect(textBlocks()).toBe(0);

    const textHead = element.querySelector('[data-group="Text"] .group-head') as HTMLButtonElement;
    textHead.click();
    fixture.detectChanges();
    expect(textBlocks()).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem(PALETTE_COLLAPSED_KEY) ?? '[]')).not.toContain('Text');
    textHead.click();
    fixture.detectChanges();
    expect(textBlocks()).toBe(0);

    const search = element.querySelector('[data-testid="palette-search"]') as HTMLInputElement;
    search.value = 'lower';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(textBlocks()).toBe(1);

    search.value = '';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (element.querySelector('[data-testid="palette-collapse-all"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelectorAll('[data-testid="palette-block"]').length).toBe(0);
    (element.querySelector('[data-testid="palette-expand-all"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelectorAll('[data-testid="palette-block"]').length).toBeGreaterThan(30);
  });

  it('should open the quick guide and walk through the tour, opening the panes it shows', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('[data-testid="help-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="quick-guide"]')).not.toBeNull();

    (element.querySelector('[data-testid="start-tour"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="quick-guide"]')).toBeNull();
    const card = () => element.querySelector('[data-testid="tour-card"]');
    expect(card()?.textContent).toContain('Step 1 of');
    expect(card()?.textContent).toContain('Source pane');

    const next = () => (element.querySelector('[data-testid="tour-next"]') as HTMLButtonElement).click();
    for (let step = 0; step < 5; step++) next();
    fixture.detectChanges();
    expect(card()?.textContent).toContain('Blocks');
    expect(element.querySelector('app-block-palette')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(card()).toBeNull();
  });

  it('should start an empty transform and open the form for a palette block', async () => {
    localStorage.setItem(PALETTE_OPEN_KEY, '1');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector(`[data-example="${BLANK_EXAMPLE_ID}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="result"]')?.textContent).toContain('No block is connected');
    (element.querySelector('[data-testid="palette-expand-all"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    element
      .querySelector('[data-testid="palette-block"][data-type="lower"]')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('#block-form-title')?.textContent).toContain('Add Lower');
  });

  it('should resize the source pane from the splitter', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const splitter = fixture.nativeElement.querySelector('.splitter') as HTMLElement;
    const shell = fixture.nativeElement.querySelector('.shell') as HTMLElement;
    splitter.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, clientX: 380, pointerId: 1, bubbles: true }),
    );
    splitter.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 500, pointerId: 1, bubbles: true }),
    );
    fixture.detectChanges();
    expect(shell.style.gridTemplateColumns).toContain('500px');
    splitter.dispatchEvent(new PointerEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    expect(shell.style.gridTemplateColumns).toContain('380px');
  });

  it('should insert a block dropped on the output arrow', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const app = fixture.componentInstance;
    const canvas = fixture.debugElement.query(By.directive(TransformCanvasComponent))
      .componentInstance as TransformCanvasComponent;
    const rootId = app['graph']().rootId!;
    canvas.blockDropped.emit({
      type: 'trim',
      position: { x: 0, y: 0 },
      arrow: { sourceId: rootId, targetId: TRANSFORM_OUTPUT_ID, inputKey: 'value' },
    });
    app['onFormSave']({ type: 'trim', attributes: {} });
    const document = JSON.parse(app['jsonText']());
    expect(document.type).toBe('trim');
    expect(document.attributes.input.type).toBe('lower');
    expect(app['selected']()?.id).toBe(app['graph']().rootId);
  });

  it('should change a literal typed into its pill on the canvas', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const app = fixture.componentInstance;
    fixture.debugElement
      .query((element) => element.name === 'app-json-editor')
      .triggerEventHandler(
        'valueChange',
        '{ "name": "Greeting", "type": "concat", "attributes": { "values": ["Foo", 1] } }',
      );
    await fixture.whenStable();
    const canvas = fixture.debugElement.query(By.directive(TransformCanvasComponent))
      .componentInstance as TransformCanvasComponent;
    const [text, number] = app['graph']().nodes.filter((node) => node.kind === 'literal');
    canvas.literalChange.emit({ nodeId: text.id, text: 'Bar' });
    canvas.literalChange.emit({ nodeId: number.id, text: '2' });
    expect(JSON.parse(app['jsonText']()).attributes.values).toEqual(['Bar', 2]);
  });

  it('should delete a selected arrow before the selected block', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const canvas = fixture.debugElement.query(By.directive(TransformCanvasComponent))
      .componentInstance as TransformCanvasComponent;
    const text = () => fixture.componentInstance['jsonText']();
    const before = text();
    const arrow = vi.spyOn(canvas, 'deleteSelectedConnection').mockReturnValue(true);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(arrow).toHaveBeenCalled();
    expect(text()).toBe(before);
    arrow.mockReturnValue(false);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(text()).not.toBe(before);
  });
});
