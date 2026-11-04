import { formatResponse } from './index';

const toBase64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

describe('formatResponse', () => {
  describe('XML mode', () => {
    it('formats an XML response', () => {
      const xml = '<root><item>value</item></root>';
      const result = formatResponse(xml, toBase64(xml), 'application/xml', null);

      expect(result).toContain('<root>');
      expect(result).toContain('<item>value</item>');
    });

    it('keeps a parsed JSON response visible', () => {
      const json = { name: 'bruno', tags: ['api'] };
      const result = formatResponse(json, toBase64(JSON.stringify(json)), 'application/xml', null);

      expect(result).toContain('"name": "bruno"');
      expect(result).toContain('"api"');
    });
  });
});
