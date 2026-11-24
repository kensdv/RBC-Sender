import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaceholderContext, htmlToText, renderTemplate } from '../server/placeholders.js';

function context() {
  return createPlaceholderContext({
    recipient: {
      id: 42,
      email: 'alex@example.co.uk',
      firstName: '<Alex>',
      lastName: 'Morgan',
      company: 'A&B "Labs"',
      custom: { Plan: 'Premium' },
    },
    subject: 'Account update',
    totalRecipients: 7,
    unsubscribeUrl: 'https://mailer.test/unsubscribe?a=1&b=2',
    now: new Date('2026-01-02T03:04:05Z'),
    randomId: 'fixed-id',
  });
}

test('renders SuperMailer fields and moustache aliases', () => {
  const rendered = renderTemplate('[Firstname] [Name] [~EMail~] [~ID~] [~SUBJECT~] [EMail_DomainPart] [EMail_DomainPartNoTLD] [Mail_Empfänger_Anzahl] {{company}} {{random_id}}', context(), 'text');
  assert.equal(rendered, '<Alex> <Alex> Morgan alex@example.co.uk 42 Account update example.co.uk example.co 7 A&B "Labs" fixed-id');
});

test('escapes personalized values in HTML but not in plain text', () => {
  assert.equal(renderTemplate('[Firstname] {{company}} [AbmeldeLink]', context(), 'html'), '&lt;Alex&gt; A&amp;B &quot;Labs&quot; https://mailer.test/unsubscribe?a=1&amp;b=2');
  assert.equal(renderTemplate('[Firstname] {{company}}', context(), 'text'), '<Alex> A&B "Labs"');
});

test('supports custom fields and preserves unknown placeholders', () => {
  assert.equal(renderTemplate('[Plan] {{plan}} [Notice] {{unknown}}', context(), 'text'), 'Premium Premium [Notice] {{unknown}}');
});

test('creates a plain-text alternative from HTML', () => {
  assert.equal(htmlToText('<style>p{color:red}</style><h1>Hello</h1><p>A&amp;B<br>Next</p>'), 'Hello\nA&B\nNext');
});
