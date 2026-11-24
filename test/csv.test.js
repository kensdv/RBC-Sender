import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecipientsCsv } from '../server/csv.js';

test('parses quoted CSV and custom fields', () => {
  const result = parseRecipientsCsv('email,first_name,last_name,company,Plan\r\nalex@example.com,"Alex, Jr.","Morgan ""M""","A&B, Ltd",Premium\r\n');
  assert.deepEqual(result.errors, []);
  assert.equal(result.records[0].firstName, 'Alex, Jr.');
  assert.equal(result.records[0].lastName, 'Morgan "M"');
  assert.equal(result.records[0].company, 'A&B, Ltd');
  assert.deepEqual(result.records[0].custom, { Plan: 'Premium' });
});

test('detects semicolons and SuperMailer email headers', () => {
  const result = parseRecipientsCsv('Firstname;Name;~EMail~\nAlex;Morgan;ALEX@EXAMPLE.COM');
  assert.equal(result.delimiter, ';');
  assert.equal(result.records[0].email, 'alex@example.com');
  assert.equal(result.records[0].firstName, 'Alex');
  assert.equal(result.records[0].lastName, 'Morgan');
});

test('reports invalid rows without discarding valid recipients', () => {
  const result = parseRecipientsCsv('email,first_name\nbad-address,Bad\nvalid@example.com,Valid');
  assert.equal(result.records.length, 1);
  assert.deepEqual(result.errors, [{ row: 2, error: 'Invalid email address' }]);
});

test('rejects malformed or incomplete CSV', () => {
  assert.throws(() => parseRecipientsCsv('first_name,last_name\nAlex,Morgan'), /email column/);
  assert.throws(() => parseRecipientsCsv('email\n"unterminated@example.com'), /unterminated/);
});
