function detectDelimiter(line) {
  const candidates = [',', ';', '\t'];
  const counts = new Map(candidates.map((delimiter) => [delimiter, 0]));
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    if (!quoted && counts.has(line[index])) counts.set(line[index], counts.get(line[index]) + 1);
  }
  return candidates.sort((a, b) => counts.get(b) - counts.get(a))[0];
}

function parseRows(input, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

function normalizeHeader(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function validEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseRecipientsCsv(input) {
  const source = String(input || '').replace(/^\uFEFF/, '');
  if (!source.trim()) throw new Error('CSV input is empty');
  const delimiter = detectDelimiter(source.split(/\r?\n/, 1)[0]);
  const rows = parseRows(source, delimiter);
  if (rows.length < 2) throw new Error('CSV must contain a header and at least one recipient');
  const headers = rows[0].map((header) => header.trim());
  const normalized = headers.map(normalizeHeader);
  const emailIndex = normalized.findIndex((header) => ['email', 'emailaddress', 'mail', 'emailadresse'].includes(header));
  if (emailIndex < 0) throw new Error('CSV requires an email column');
  const firstIndex = normalized.findIndex((header) => ['firstname', 'vorname', 'givenname'].includes(header));
  const lastIndex = normalized.findIndex((header) => ['lastname', 'surname', 'familyname', 'name', 'nachname'].includes(header));
  const companyIndex = normalized.findIndex((header) => ['company', 'organization', 'organisation', 'firma'].includes(header));
  const special = new Set([emailIndex, firstIndex, lastIndex, companyIndex]);
  const records = [];
  const errors = [];
  for (const [index, cells] of rows.slice(1).entries()) {
    const email = (cells[emailIndex] || '').trim().toLowerCase();
    const rowNumber = index + 2;
    if (!validEmail(email)) {
      errors.push({ row: rowNumber, error: 'Invalid email address' });
      continue;
    }
    const custom = {};
    for (let column = 0; column < headers.length; column += 1) {
      if (!special.has(column) && headers[column] && cells[column]?.trim()) custom[headers[column]] = cells[column].trim().slice(0, 500);
    }
    records.push({
      row: rowNumber,
      email,
      firstName: (cells[firstIndex] || '').trim().slice(0, 200),
      lastName: (cells[lastIndex] || '').trim().slice(0, 200),
      company: (cells[companyIndex] || '').trim().slice(0, 200),
      custom,
    });
  }
  return { records, errors, delimiter };
}
