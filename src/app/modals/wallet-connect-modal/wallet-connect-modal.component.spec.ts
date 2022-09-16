import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WalletConnectModalComponent } from './wallet-connect-modal.component';

describe('WalletConnectModalComponent', () => {
  let component: WalletConnectModalComponent;
  let fixture: ComponentFixture<WalletConnectModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [WalletConnectModalComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(WalletConnectModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
