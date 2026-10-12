import { describe, expect, it } from 'vitest';
import {
  formatRegistration,
  isValidRegistration,
  normaliseRegistration,
} from '../shared/registration';
import { mobileSchema } from '../shared/schemas/common';
import { vehicleInputSchema } from '../shared/schemas/vehicle';

describe('registration numbers', () => {
  it('normalises case, spaces and hyphens', () => {
    expect(normaliseRegistration('mh 14 eh-1234')).toBe('MH14EH1234');
    expect(normaliseRegistration(' 22 bh 1234 aa ')).toBe('22BH1234AA');
  });

  it('accepts standard and BH-series formats', () => {
    for (const ok of [
      'MH14EH1234',
      'mh 12 kt 4410',
      'DL1C1234',
      'KA011234',
      'MH 14 ABC 1234',
      '22 BH 1234 AA',
      '21BH0001A',
    ]) {
      expect(isValidRegistration(ok), ok).toBe(true);
    }
    for (const bad of [
      '',
      'MH14EH123',
      'M14EH1234',
      'MH14EHAB1234',
      '22BH123AA',
      'BH1234AA',
      '1234',
    ]) {
      expect(isValidRegistration(bad), bad).toBe(false);
    }
  });

  it('formats with spaces for display', () => {
    expect(formatRegistration('MH14EH1234')).toBe('MH 14 EH 1234');
    expect(formatRegistration('DL1C1234')).toBe('DL 1 C 1234');
    expect(formatRegistration('KA011234')).toBe('KA 01 1234');
    expect(formatRegistration('22BH1234AA')).toBe('22 BH 1234 AA');
  });

  it('vehicle schema stores the normalised number and requires car type for cars', () => {
    const car = vehicleInputSchema.parse({
      category: 'CAR',
      carType: 'SEDAN',
      registrationNumber: 'mh 14 eh-1234',
      make: 'Honda',
      model: 'City',
      color: 'White',
    });
    expect(car.registrationNumber).toBe('MH14EH1234');
    expect(vehicleInputSchema.safeParse({ ...car, carType: null }).success).toBe(false);
    const bike = vehicleInputSchema.parse({ ...car, category: 'BIKE', carType: 'SUV' });
    expect(bike.carType).toBeNull();
  });
});

describe('mobile numbers', () => {
  it('accepts 10-digit Indian mobiles with common prefixes', () => {
    expect(mobileSchema.parse('98765 43210')).toBe('9876543210');
    expect(mobileSchema.parse('+91 98765-43210')).toBe('9876543210');
    expect(mobileSchema.parse('09876543210')).toBe('9876543210');
    expect(mobileSchema.safeParse('1234567890').success).toBe(false);
    expect(mobileSchema.safeParse('98765').success).toBe(false);
  });
});
