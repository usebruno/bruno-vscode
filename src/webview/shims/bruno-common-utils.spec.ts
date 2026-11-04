import { describe, it, expect } from 'vitest';
import { jsonToDotenv as packageJsonToDotenv } from '@usebruno/common/utils';
import {
  jsonToDotenv,
  getDataTypeFromValue,
  parseValueByDataType,
  valueToString,
  validateDataTypeValue,
  BRUNO_VARIABLE_DATATYPES
} from './bruno-common-utils';

describe('bruno-common-utils datatype shim', () => {
  it('exposes the four supported data types', () => {
    expect([...BRUNO_VARIABLE_DATATYPES]).toEqual(['string', 'number', 'boolean', 'object']);
  });

  describe('valueToString (env editor display)', () => {
    it('renders an object as pretty JSON, never "[object Object]"', () => {
      const out = valueToString({ host: 'localhost', port: 8081 }, 2);
      expect(out).not.toContain('[object Object]');
      expect(JSON.parse(out)).toEqual({ host: 'localhost', port: 8081 });
    });

    it('passes strings through and stringifies primitives', () => {
      expect(valueToString('abc')).toBe('abc');
      expect(valueToString(30)).toBe('30');
      expect(valueToString(true)).toBe('true');
      expect(valueToString(null)).toBe('');
      expect(valueToString(undefined)).toBe('');
    });
  });

  describe('parseValueByDataType (coerce edited string back to native)', () => {
    it('round-trips an object through valueToString', () => {
      const obj = { a: 1, b: [2, 3] };
      expect(parseValueByDataType(valueToString(obj, 2), 'object')).toEqual(obj);
    });

    it('coerces numbers and booleans, leaves strings alone', () => {
      expect(parseValueByDataType('30', 'number')).toBe(30);
      expect(parseValueByDataType('true', 'boolean')).toBe(true);
      expect(parseValueByDataType('hello', 'string')).toBe('hello');
    });

    it('returns the raw value when a string is not coercible to the declared type', () => {
      expect(parseValueByDataType('not-json', 'object')).toBe('not-json');
      expect(parseValueByDataType('abc', 'number')).toBe('abc');
    });
  });

  describe('getDataTypeFromValue', () => {
    it('infers the native type', () => {
      expect(getDataTypeFromValue(30)).toBe('number');
      expect(getDataTypeFromValue(true)).toBe('boolean');
      expect(getDataTypeFromValue({ a: 1 })).toBe('object');
      expect(getDataTypeFromValue('x')).toBe('string');
    });
  });

  describe('validateDataTypeValue', () => {
    it('flags a value whose coerced type does not match the declared type', () => {
      expect(validateDataTypeValue(parseValueByDataType('abc', 'number'), 'number')).toMatch(/not a valid number/);
      expect(validateDataTypeValue(parseValueByDataType('30', 'number'), 'number')).toBeNull();
      expect(validateDataTypeValue(parseValueByDataType('{"a":1}', 'object'), 'object')).toBeNull();
    });
  });

  describe('jsonToDotenv', () => {
    const cases = [
      [{ name: 'HOST', value: 'localhost' }],
      [{ name: 'MULTILINE', value: 'a\nb' }],
      [{ name: 'HASH', value: 'a#b' }],
      [{ name: 'HASH_AND_QUOTE', value: 'a#b\'c' }],
      [{ name: 'HASH_ALL_QUOTES', value: 'a#b\'c`d"e' }],
      [{ name: 'PADDED', value: '  spaced  ' }],
      [{ name: 'EMPTY' }],
      [{ name: '', value: 'dropped' }, { name: 'KEPT', value: '1' }]
    ];

    it('serializes exactly like @usebruno/common, so the extension and webview never disagree', () => {
      cases.forEach((variables) => {
        expect(jsonToDotenv(variables)).toBe(packageJsonToDotenv(variables));
      });
    });
  });
});
