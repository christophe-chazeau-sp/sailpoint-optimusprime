import { ChangeDetectorRef, Component, Input, OnChanges } from '@angular/core';

@Component({
  selector: 'app-anchor-socket',
  template: '',
  styles: [':host { display: block; width: 2px; height: 2px; }'],
})
export class AnchorSocketComponent implements OnChanges {
  @Input() data: unknown;
  @Input() rendered!: () => void;

  constructor(private readonly cdr: ChangeDetectorRef) {
    this.cdr.detach();
  }

  ngOnChanges(): void {
    this.cdr.detectChanges();
    requestAnimationFrame(() => this.rendered?.());
  }
}
