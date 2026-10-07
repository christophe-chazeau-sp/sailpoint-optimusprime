import { TestBed } from '@angular/core/testing';
import { App, BLANK_EXAMPLE_ID, LEFT_PANE_OPEN_KEY, LEFT_PANE_WIDTH_KEY, PALETTE_OPEN_KEY } from './app';

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

  it('should list the blocks and fold the blocks pane', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('[data-testid="palette-block"]').length).toBeGreaterThan(30);
    (element.querySelector('[data-testid="palette-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('app-block-palette')).toBeNull();
    expect(localStorage.getItem(PALETTE_OPEN_KEY)).toBe('0');
  });

  it('should start an empty transform and open the form for a palette block', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const select = element.querySelector('.source select') as HTMLSelectElement;
    select.value = BLANK_EXAMPLE_ID;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="result"]')?.textContent).toContain('No block is connected');
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
});
