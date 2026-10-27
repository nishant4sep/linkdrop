import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeInstagramPost, validateResourceUrl } from './url-validation.ts';

describe('normalizeInstagramPost', () => {
  it('normalizes a Reel URL', () => {
    const result = normalizeInstagramPost('https://www.instagram.com/reel/CxabYz12345/');
    assert.ok(result);
    assert.match(result!.canonicalUrl, /^https:\/\/www\.instagram\.com\/reel\/CxabYz12345\//);
    assert.equal(result!.postCode, 'CxabYz12345');
  });

  it('normalizes a post URL', () => {
    const result = normalizeInstagramPost('https://instagram.com/p/CxabYz12345');
    assert.ok(result);
    assert.match(result!.canonicalUrl, /^https:\/\/www\.instagram\.com\/p\/CxabYz12345\//);
  });

  it('normalizes a tv URL', () => {
    const result = normalizeInstagramPost('https://www.instagram.com/tv/CxabYz12345/');
    assert.ok(result);
    assert.equal(result!.postCode, 'CxabYz12345');
  });

  it('rejects non-instagram hosts', () => {
    assert.equal(normalizeInstagramPost('https://example.com/p/CxabYz12345'), null);
    assert.equal(normalizeInstagramPost('https://instagr.am/reel/CxabYz12345/'), null);
  });

  it('rejects http and credentials', () => {
    assert.equal(normalizeInstagramPost('http://www.instagram.com/reel/CxabYz12345/'), null);
    assert.equal(normalizeInstagramPost('https://user:pass@www.instagram.com/reel/CxabYz12345/'), null);
  });

  it('rejects URLs without a shortcode', () => {
    assert.equal(normalizeInstagramPost('https://www.instagram.com/reel/'), null);
    assert.equal(normalizeInstagramPost('https://www.instagram.com/reel/ab/'), null);
    assert.equal(normalizeInstagramPost('https://www.instagram.com/'), null);
  });

  it('rejects non-strings, empty, and overlong input', () => {
    assert.equal(normalizeInstagramPost(null), null);
    assert.equal(normalizeInstagramPost(123), null);
    assert.equal(normalizeInstagramPost(''), null);
    assert.equal(normalizeInstagramPost('a'.repeat(3000)), null);
  });
});

describe('validateResourceUrl', () => {
  it('accepts a valid HTTPS external resource URL', () => {
    const result = validateResourceUrl('https://example.com/resource.zip');
    assert.equal(result, 'https://example.com/resource.zip');
  });

  it('strips fragments and normalizes', () => {
    const result = validateResourceUrl('https://Example.COM/Path/File.PDF#section');
    assert.equal(result, 'https://example.com/Path/File.PDF');
  });

  it('rejects http', () => {
    assert.equal(validateResourceUrl('http://example.com/resource.zip'), null);
  });

  it('accepts a resource URL with a query string', () => {
    const result = validateResourceUrl('https://cdn.example.com/file.zip?token=abc');
    assert.equal(result, 'https://cdn.example.com/file.zip?token=abc');
  });

  it('rejects localhost and loopback', () => {
    assert.equal(validateResourceUrl('http://localhost/resource.zip'), null);
    assert.equal(validateResourceUrl('https://127.0.0.1/resource.zip'), null);
    assert.equal(validateResourceUrl('https://::1/resource.zip'), null);
  });

  it('rejects private IP ranges', () => {
    assert.equal(validateResourceUrl('https://10.0.0.1/resource.zip'), null);
    assert.equal(validateResourceUrl('https://192.168.1.1/resource.zip'), null);
    assert.equal(validateResourceUrl('https://172.16.0.1/resource.zip'), null);
  });

  it('rejects credentials and ports other than 443', () => {
    assert.equal(validateResourceUrl('https://user:pass@example.com/resource.zip'), null);
    assert.equal(validateResourceUrl('https://example.com:8443/resource.zip'), null);
  });

  it('rejects missing protocol, overlong, and non-string input', () => {
    assert.equal(validateResourceUrl('example.com/resource.zip'), null);
    assert.equal(validateResourceUrl('a'.repeat(5000)), null);
    assert.equal(validateResourceUrl(null), null);
    assert.equal(validateResourceUrl(42), null);
  });
});
