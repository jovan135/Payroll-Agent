const fs = require("fs");
const path = require("path");
const {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
} = require("pdf-lib");

const PAGE = {
  letter: [612, 792],
  ni184: [1008, 612],
};

const COLORS = {
  ink: rgb(0.055, 0.118, 0.173),
  muted: rgb(0.36, 0.43, 0.49),
  line: rgb(0.82, 0.85, 0.88),
  pale: rgb(0.93, 0.97, 0.97),
  teal: rgb(0, 0.52, 0.49),
  white: rgb(1, 1, 1),
};

const NI184_MAP = {
  textFields: {
    employerTradeName: { x: 126, y: 531, size: 8 },
    addressLine1: { x: 104, y: 508, size: 8 },
    addressLine2: { x: 104, y: 485, size: 8 },
    totalEmployees: { x: 220, y: 175, size: 8, align: "center" },
    totalContributions: { x: 970, y: 171, size: 8, align: "right" },
    preparedByName: { x: 420, y: 36, size: 8, align: "center" },
  },
  boxFields: {
    employerRegistrationNumber: { x: 604, y: 532, step: 12.4, size: 8 },
    telephone: { y: 506, xs: [815, 832, 849, 879, 896, 913, 930], size: 8 },
    periodFrom: { y: 468, xs: [137, 151, 165, 179, 194, 208, 223, 237], size: 8 },
    periodTo: { y: 468, xs: [292, 306, 320, 334, 349, 363, 378, 392], size: 8 },
    weeksInPeriod: { y: 468, xs: [591, 607], size: 8 },
  },
  table: {
    firstRowY: 378,
    rowStep: 18,
    rowsPerEmployee: 2,
    maxEmployees: 5,
    size: 7,
    columns: {
      nisNumber: { x: 108, align: "center" },
      surname: { x: 205 },
      firstName: { x: 364 },
      birthYear: { x: 443, align: "center" },
      birthMonth: { x: 477, align: "center" },
      birthDay: { x: 506, align: "center" },
      employedYear: { x: 538, align: "center" },
      employedMonth: { x: 572, align: "center" },
      employedDay: { x: 604, align: "center" },
      lastWorkYear: { x: 538, align: "center", secondRow: true },
      lastWorkMonth: { x: 572, align: "center", secondRow: true },
      lastWorkDay: { x: 604, align: "center", secondRow: true },
      salary: { x: 660, align: "right" },
      week1: { x: 705, align: "right" },
      week2: { x: 750, align: "right" },
      week3: { x: 799, align: "right" },
      week4: { x: 848, align: "right" },
      week5: { x: 893, align: "right" },
      total: { x: 964, align: "right" },
    },
  },
};

const NI187_MAP = {
  textFields: {
    employerTradeName: { x: 175, y: 646, size: 9 },
    addressLine1: { x: 92, y: 615, size: 9 },
    addressLine2: { x: 92, y: 583, size: 9 },
    contributionsDue: { x: 255, y: 426, size: 9, align: "right" },
    totalAmountDue: { x: 255, y: 364, size: 9, align: "right" },
    numberOfEmployees: { x: 550, y: 502, size: 9, align: "center" },
    declarantName: { x: 72, y: 218, size: 9 },
    declarantPosition: { x: 90, y: 162, size: 9 },
  },
  boxFields: {
    telephone: { y: 566, xs: [135, 154, 174, 215, 235, 254, 274], size: 10 },
    employerRegistrationNumber: { x: 480, y: 568, step: 17, size: 10 },
    periodFrom: { y: 535, xs: [303, 317, 331, 345, 364, 378, 395, 409], size: 10 },
    periodTo: { y: 535, xs: [456, 470, 484, 498, 517, 531, 548, 562], size: 10 },
  },
};

function templateBytes(fileName) {
  const candidates = [
    path.join(process.cwd(), "templates", fileName),
    path.join(__dirname, "..", "..", "templates", fileName),
  ];
  const selected = candidates.find((candidate) => fs.existsSync(candidate));
  if (!selected) throw new Error(`PDF template is missing: ${fileName}`);
  return fs.readFileSync(selected);
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function monthDates(month) {
  const [year, monthNumber] = String(month).split("-").map(Number);
  if (!year || !monthNumber) throw new Error("Payroll month must be in YYYY-MM format.");
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const mm = String(monthNumber).padStart(2, "0");
  return {
    first: `${year}${mm}01`,
    last: `${year}${mm}${String(lastDay).padStart(2, "0")}`,
    lastIso: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

function dateParts(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? [match[1], match[2], match[3]] : ["", "", ""];
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function alignedX(font, value, field) {
  const width = font.widthOfTextAtSize(value, field.size);
  if (field.align === "right") return field.x - width;
  if (field.align === "center") return field.x - (width / 2);
  return field.x;
}

function drawMappedText(page, font, field, value) {
  const text = String(value || "");
  if (!text) return;
  page.drawText(text, {
    x: alignedX(font, text, field),
    y: field.y,
    size: field.size,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawBoxedText(page, font, field, value) {
  const text = String(value || "");
  const positions = field.xs || Array.from({ length: text.length }, (_, index) => field.x + (index * field.step));
  [...text].forEach((character, index) => {
    if (positions[index] === undefined) return;
    const width = font.widthOfTextAtSize(character, field.size);
    page.drawText(character, {
      x: Number(positions[index]) - (width / 2),
      y: field.y,
      size: field.size,
      font,
      color: rgb(0, 0, 0),
    });
  });
}

function companyFields(company) {
  const address = company.address || {};
  const declarant = company.declarant || {};
  return {
    tradeName: company.tradeName || company.name || company.legalName || "",
    addressLine1: address.line1 || "",
    addressLine2: [address.line2, address.city].filter(Boolean).join(", "),
    telephone: digitsOnly(company.phone || company.telephone),
    registrationNumber: digitsOnly(company.nibEmployerRegistrationNumber || company.registrationNumber),
    declarantName: declarant.name || company.contactName || "",
    declarantPosition: declarant.position || "",
  };
}

function employeeLookup(employees) {
  return new Map((employees || []).map((employee) => [
    employee.employee_id || employee.employeeId || employee.id,
    employee,
  ]));
}

function ni184Rows(run, employees) {
  const lookup = employeeLookup(employees);
  const dates = monthDates(run.month);
  const weeks = Number(run.mondayCount || run.monday_count || 0);
  return (run.rows || []).map((row) => {
    const employee = lookup.get(row.employeeId || row.employee_id) || {};
    const [birthYear, birthMonth, birthDay] = dateParts(employee.date_of_birth || employee.dateOfBirth);
    const [employedYear, employedMonth, employedDay] = dateParts(employee.date_employed || employee.dateEmployed);
    const [lastWorkYear, lastWorkMonth, lastWorkDay] = dateParts(dates.lastIso);
    const weeklyTotal = weeks ? (Number(row.nisEmployee || 0) + Number(row.nisEmployer || 0)) / weeks : 0;
    const total = Number(row.nisEmployee || 0) + Number(row.nisEmployer || 0);
    const values = {
      nisNumber: row.nisNumber || row.nis_number || employee.nis_number || "",
      surname: employee.surname || "",
      firstName: employee.first_name || employee.firstName || "",
      birthYear,
      birthMonth,
      birthDay,
      employedYear,
      employedMonth,
      employedDay,
      lastWorkYear,
      lastWorkMonth,
      lastWorkDay,
      salary: money(row.baseSalary ?? row.grossPay),
      total: money(total),
    };
    for (let index = 1; index <= 5; index += 1) values[`week${index}`] = index <= weeks ? money(weeklyTotal) : "";
    return { values, total };
  });
}

function drawNi184Employee(page, font, rowIndex, row) {
  const table = NI184_MAP.table;
  const firstY = table.firstRowY - (rowIndex * table.rowStep * table.rowsPerEmployee);
  Object.entries(row.values).forEach(([key, value]) => {
    if (!value) return;
    const column = table.columns[key];
    const field = {
      x: column.x,
      y: column.secondRow ? firstY - table.rowStep : firstY,
      size: table.size,
      align: column.align,
    };
    drawMappedText(page, font, field, value);
  });
}

async function createNi184Pdf(run, company, employees) {
  const source = templateBytes("NI184.pdf");
  const output = await PDFDocument.create();
  const [templatePage] = await output.embedPdf(source, [0]);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const fields = companyFields(company);
  const dates = monthDates(run.month);
  const allRows = ni184Rows(run, employees);
  const rowGroups = chunks(allRows, NI184_MAP.table.maxEmployees);

  for (const rows of rowGroups) {
    const page = output.addPage(PAGE.ni184);
    page.drawPage(templatePage, { x: 0, y: 612, width: 612, height: 1008, rotate: degrees(-90) });
    const textValues = {
      employerTradeName: fields.tradeName,
      addressLine1: fields.addressLine1,
      addressLine2: fields.addressLine2,
      totalEmployees: String(rows.length),
      totalContributions: money(rows.reduce((sum, row) => sum + row.total, 0)),
      preparedByName: fields.declarantName,
    };
    const boxValues = {
      employerRegistrationNumber: fields.registrationNumber,
      telephone: fields.telephone,
      periodFrom: dates.first,
      periodTo: dates.last,
      weeksInPeriod: String(run.mondayCount || run.monday_count || 0).padStart(2, "0"),
    };
    Object.entries(NI184_MAP.textFields).forEach(([key, field]) => drawMappedText(page, font, field, textValues[key]));
    Object.entries(NI184_MAP.boxFields).forEach(([key, field]) => drawBoxedText(page, font, field, boxValues[key]));
    rows.forEach((row, index) => drawNi184Employee(page, font, index, row));
  }

  return Buffer.from(await output.save({ useObjectStreams: false }));
}

async function createNi187Pdf(run, company) {
  const output = await PDFDocument.load(templateBytes("NI187.pdf"));
  const page = output.getPage(0);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const fields = companyFields(company);
  const dates = monthDates(run.month);
  const contributionTotal = Number(run.nisEmployee || 0) + Number(run.nisEmployer || 0);
  const textValues = {
    employerTradeName: fields.tradeName,
    addressLine1: fields.addressLine1,
    addressLine2: fields.addressLine2,
    contributionsDue: money(contributionTotal),
    totalAmountDue: money(contributionTotal),
    numberOfEmployees: String((run.rows || []).length),
    declarantName: fields.declarantName,
    declarantPosition: fields.declarantPosition,
  };
  const boxValues = {
    telephone: fields.telephone,
    employerRegistrationNumber: fields.registrationNumber,
    periodFrom: dates.first,
    periodTo: dates.last,
  };
  Object.entries(NI187_MAP.textFields).forEach(([key, field]) => drawMappedText(page, font, field, textValues[key]));
  Object.entries(NI187_MAP.boxFields).forEach(([key, field]) => drawBoxedText(page, font, field, boxValues[key]));
  return Buffer.from(await output.save({ useObjectStreams: false }));
}

function fittedSize(font, text, maxWidth, preferred, minimum = 9) {
  let size = preferred;
  while (size > minimum && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

function drawRight(page, font, text, right, y, size, color = COLORS.ink) {
  page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y, size, font, color });
}

function drawTable(page, fonts, title, rows, startY) {
  let y = startY;
  page.drawText(title.toUpperCase(), { x: 44, y, size: 9, font: fonts.bold, color: COLORS.teal });
  y -= 16;
  page.drawLine({ start: { x: 44, y }, end: { x: 568, y }, thickness: 1, color: COLORS.line });
  y -= 15;
  for (const row of rows) {
    page.drawText(String(row.label), { x: 48, y, size: 9.5, font: row.bold ? fonts.bold : fonts.regular, color: COLORS.ink });
    drawRight(page, row.bold ? fonts.bold : fonts.regular, String(row.amount), 564, y, 9.5, COLORS.ink);
    y -= 17;
  }
  return y - 5;
}

function adjustmentRows(row, treatments, sign = "") {
  return (row.adjustments || [])
    .filter((adjustment) => treatments.includes(adjustment.treatment))
    .map((adjustment) => ({ label: adjustment.label || adjustment.type || "Adjustment", amount: `${sign}TTD ${money(adjustment.amount)}` }));
}

async function createPayslipPdf(row, run, company) {
  const document = await PDFDocument.create();
  const page = document.addPage(PAGE.letter);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const companyInfo = companyFields(company);
  const companyTitle = companyInfo.tradeName || run.companyName || "Payroll Agent";
  const companyTitleSize = fittedSize(bold, companyTitle, 350, 18, 12);

  page.drawText(companyTitle, { x: 44, y: 742, size: companyTitleSize, font: bold, color: COLORS.ink });
  page.drawText(companyAddressLine(companyInfo), { x: 44, y: 722, size: 8.5, font: regular, color: COLORS.muted });
  page.drawText(`Tel: ${companyInfo.telephone || ""}`, { x: 44, y: 707, size: 8.5, font: regular, color: COLORS.muted });
  drawRight(page, bold, "PAYSLIP", 568, 740, 16, COLORS.teal);
  drawRight(page, regular, `Period: ${run.month}`, 568, 720, 9, COLORS.muted);
  drawRight(page, regular, `Employer NIS: ${companyInfo.registrationNumber}`, 568, 705, 9, COLORS.muted);
  page.drawLine({ start: { x: 44, y: 687 }, end: { x: 568, y: 687 }, thickness: 1.5, color: COLORS.ink });

  const meta = [
    ["Employee", row.fullName || ""],
    ["Employee ID", row.employeeId || ""],
    ["NIS Number", row.nisNumber || ""],
    ["BIR Number", row.birNumber || ""],
  ];
  meta.forEach(([label, value], index) => {
    const column = index % 2;
    const line = Math.floor(index / 2);
    const x = column ? 316 : 44;
    const y = 657 - (line * 44);
    page.drawText(label.toUpperCase(), { x, y, size: 7, font: bold, color: COLORS.muted });
    page.drawText(String(value), { x, y: y - 17, size: 10, font: regular, color: COLORS.ink });
  });

  const earnings = [
    { label: "Regular monthly salary", amount: `TTD ${money(row.baseSalary ?? row.grossPay)}` },
    ...adjustmentRows(row, ["taxable_addition"]),
    ...adjustmentRows(row, ["reduce_gross"], "-"),
    { label: "Adjusted gross pay", amount: `TTD ${money(row.adjustedGross ?? row.grossPay)}`, bold: true },
    ...adjustmentRows(row, ["non_taxable_reimbursement"]),
  ];
  const deductions = [
    { label: "NIS employee contribution", amount: `TTD ${money(row.nisEmployee)}` },
    { label: "PAYE", amount: `TTD ${money(row.paye)}` },
    { label: "Health Surcharge", amount: `TTD ${money(row.healthSurcharge)}` },
    ...adjustmentRows(row, ["pre_tax_deduction", "deduction_after_statutory"]),
    { label: "Total deductions", amount: `TTD ${money(row.totalDeductions)}`, bold: true },
  ];
  let y = drawTable(page, fonts, "Earnings", earnings, 555);
  y = drawTable(page, fonts, "Deductions", deductions, y);

  const netBoxY = Math.max(90, y - 45);
  page.drawRectangle({ x: 44, y: netBoxY, width: 524, height: 48, color: COLORS.pale, borderColor: COLORS.teal, borderWidth: 1 });
  page.drawText("NET PAY", { x: 58, y: netBoxY + 18, size: 10, font: bold, color: COLORS.teal });
  drawRight(page, bold, `TTD ${money(row.netPay)}`, 554, netBoxY + 14, 18, COLORS.ink);
  page.drawText(`Employer NIS contribution: TTD ${money(row.nisEmployer)}`, { x: 44, y: netBoxY - 24, size: 8.5, font: regular, color: COLORS.muted });
  page.drawText("Generated by Payroll Agent", { x: 44, y: 30, size: 7.5, font: regular, color: COLORS.muted });
  drawRight(page, regular, `Approved payroll ${run.month}`, 568, 30, 7.5, COLORS.muted);

  return Buffer.from(await document.save({ useObjectStreams: false }));
}

function companyAddressLine(companyInfo) {
  return [companyInfo.addressLine1, companyInfo.addressLine2].filter(Boolean).join(", ");
}

async function createPayrollPdfs(run, company, employees) {
  const payslips = await Promise.all((run.rows || []).map(async (row) => {
    const pdf = await createPayslipPdf(row, run, company);
    return {
      employeeId: row.employeeId,
      fullName: row.fullName,
      fileName: `${String(row.employeeId || "employee").replace(/[^a-z0-9_-]+/gi, "-")}-${run.month}-payslip.pdf`,
      contentType: "application/pdf",
      pdfBase64: pdf.toString("base64"),
    };
  }));
  const [ni184, ni187] = await Promise.all([
    createNi184Pdf(run, company, employees),
    createNi187Pdf(run, company),
  ]);
  return {
    payslips,
    ni184Pdf: ni184.toString("base64"),
    ni187Pdf: ni187.toString("base64"),
    byteCounts: {
      payslips: payslips.reduce((total, payslip) => total + Buffer.from(payslip.pdfBase64, "base64").length, 0),
      ni184: ni184.length,
      ni187: ni187.length,
    },
  };
}

module.exports = {
  createNi184Pdf,
  createNi187Pdf,
  createPayslipPdf,
  createPayrollPdfs,
};
