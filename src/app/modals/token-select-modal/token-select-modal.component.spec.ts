import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TokenSelectModalComponent } from './token-select-modal.component';

describe('TokenSelectModalComponent', () => {
  let component: TokenSelectModalComponent;
  let fixture: ComponentFixture<TokenSelectModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TokenSelectModalComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TokenSelectModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
