import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageLiquidityModalComponent } from './manage-liquidity-modal.component';

describe('ManageLiquidityModalComponent', () => {
  let component: ManageLiquidityModalComponent;
  let fixture: ComponentFixture<ManageLiquidityModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ManageLiquidityModalComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ManageLiquidityModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
