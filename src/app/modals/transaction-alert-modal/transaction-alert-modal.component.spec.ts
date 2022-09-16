import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TransactionAlertModalComponent } from './transaction-alert-modal.component';

describe('TransactionAlertModalComponent', () => {
  let component: TransactionAlertModalComponent;
  let fixture: ComponentFixture<TransactionAlertModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TransactionAlertModalComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TransactionAlertModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
