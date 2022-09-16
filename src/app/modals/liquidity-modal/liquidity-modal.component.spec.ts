import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LiquidityModalComponent } from './liquidity-modal.component';

describe('LiquidityModalComponent', () => {
  let component: LiquidityModalComponent;
  let fixture: ComponentFixture<LiquidityModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ LiquidityModalComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LiquidityModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
