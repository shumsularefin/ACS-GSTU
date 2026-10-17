// Spreadsheet reading (in a Web Worker, entirely in the browser) and downloadable templates.
export const ACCEPTED = '.xlsx,.xls,.csv';
export const LIMITS = 'Excel (.xlsx, .xls) or CSV, up to 5 MB and 3,000 rows per worksheet. Values only, no formulas.';

let library;
export function xlsx() {
  library ??= new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const script = document.createElement('script');
    script.src = 'js/vendor/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => {
      library = null;
      reject(Error('The spreadsheet tool could not load. Check your connection and try again.'));
    };
    document.head.append(script);
  });
  return library;
}

/** Reads every non-empty worksheet as rows of { column: value }. */
export async function readWorkbook(file) {
  if (!file) throw Error('Choose a spreadsheet file.');
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw Error('Choose an Excel (.xlsx or .xls) or CSV file.');
  if (file.size > 5 * 1024 * 1024) throw Error('The file must be 5 MB or smaller.');
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker('js/excel-worker.js');
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Error('Reading the spreadsheet took too long. Try a smaller file.'));
    }, 20000);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      if (e.data.error) reject(Error(e.data.error));
      else resolve(e.data.sheets);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(Error('This spreadsheet could not be read. Check that it is a valid Excel or CSV file.'));
    };
    worker.postMessage({ buffer }, [buffer]);
  });
}

export const templates = {
  roster: {
    file: 'ACS-member-roster-template.xlsx',
    sheet: 'Members',
    columns: ['Member Name', 'Membership ID'],
    example: ['Ayesha Rahman', '00123'],
  },
  committee: { file: 'ACS-committee-template.xlsx', sheet: 'Committee', columns: ['Name', 'Role'], example: ['Md. Example', 'President'] },
  founders: {
    file: 'ACS-founders-template.xlsx',
    sheet: 'Founders',
    columns: ['Name', 'Role'],
    example: ['Md. Example', 'Founding President'],
  },
  events: {
    file: 'ACS-events-template.xlsx',
    sheet: 'Events',
    columns: [
      'ID',
      'Title',
      'Start date',
      'End date',
      'Category',
      'Description',
      'Location',
      'Registration status',
      'Registration URL',
      'Source URL',
    ],
    example: [
      'science-fair-2026',
      'Science Fair 2026',
      '2026-11-02',
      '2026-11-03',
      'Service',
      'A two-day science fair.',
      'GSTU',
      'open',
      'https://forms.gle/example',
      '',
    ],
  },
  certificates: {
    file: 'ACS-certificate-recipients-template.xlsx',
    sheet: 'Recipients',
    columns: ['Name', 'Membership ID', 'Designation', 'Achievement'],
    example: ['Ayesha Rahman', '00123', 'Department of Chemistry', ''],
  },
};

export async function downloadTemplate(kind) {
  const X = await xlsx();
  const t = templates[kind];
  const book = X.utils.book_new();
  // The data sheet comes first (the importer selects it by default); the example lives on its own sheet
  // so it is never imported by accident. Text-formatted cells keep leading zeroes in membership IDs.
  const sheet = X.utils.aoa_to_sheet([t.columns]);
  sheet['!cols'] = t.columns.map(() => ({ wch: 26 }));
  for (const key of Object.keys(sheet)) if (!key.startsWith('!')) sheet[key].z = '@';
  X.utils.book_append_sheet(book, sheet, t.sheet);
  const help = X.utils.aoa_to_sheet([
    ['How to fill this template'],
    [`Type one record per row on the “${t.sheet}” sheet, under the column headings. Keep the headings.`],
    ['Type membership IDs as text so leading zeroes are kept.'],
    [],
    ['Example row:'],
    t.columns,
    t.example,
  ]);
  help['!cols'] = t.columns.map(() => ({ wch: 26 }));
  X.utils.book_append_sheet(book, help, 'Example (not imported)');
  X.writeFile(book, t.file);
}

export async function downloadWorkbook(name, sheets) {
  const X = await xlsx();
  const book = X.utils.book_new();
  for (const [title, rows] of Object.entries(sheets)) {
    const sheet = X.utils.aoa_to_sheet(rows);
    sheet['!cols'] = (rows[0] || []).map(() => ({ wch: 24 }));
    X.utils.book_append_sheet(book, sheet, title.slice(0, 31));
  }
  X.writeFile(book, name);
}
