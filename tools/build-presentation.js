// FreelanceHub defense deck (Arabic, RTL). node build.js <out.pptx> <docsDir> <applyThemePath>
const pptxgen = require('pptxgenjs');
const path = require('path');
const [, , OUT, DOCS, APPLY] = process.argv;
const { applyTheme } = require(APPLY);

const THEME = {
  name: 'FreelanceHub',
  headFontFace: 'Arial',
  bodyFontFace: 'Arial',
  colors: {
    dk1: '0E1A2B', lt1: 'FFFFFF', dk2: '1D3557', lt2: 'EEF3F7',
    accent1: '14A38B', accent2: 'E9A23B', accent3: 'D64550', accent4: '3B7DD8',
    accent5: '8A99AD', accent6: '0B6E5F', hlink: '3B7DD8', folHlink: '6B4FBB',
  },
};
const H = THEME.colors;

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
pres.title = 'FreelanceHub — مناقشة مشروع الباك إند';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

const AR = { rtlMode: true, align: 'right', lang: 'ar-SA' };
const W = 13.333;

// ───────── layouts ─────────
pres.defineSlideMaster({
  title: 'DARK',
  background: { color: H.dk1 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.7, y: 2.2, w: 11.9, h: 1.4, align: 'right', fontSize: 48, bold: true, color: C.background1, valign: 'middle' }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: 0.7, y: 3.7, w: 11.9, h: 1.0, align: 'right', fontSize: 22, color: C.accent1, valign: 'top' }, text: '' } },
  ],
});
pres.defineSlideMaster({
  title: 'CONTENT',
  background: { color: H.lt1 },
  margin: [0.5, 0.6, 0.5, 0.6],
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.3, w: 12.13, h: 0.85, align: 'right', fontSize: 30, bold: true, color: C.text1, valign: 'middle' }, text: '' } },
    { text: { text: 'FreelanceHub · Back-End', options: { x: 0.6, y: 7.02, w: 4, h: 0.3, fontSize: 10, color: C.accent5, align: 'left' } } },
  ],
  slideNumber: { x: 12.2, y: 7.02, w: 0.5, h: 0.3, fontSize: 10, color: C.accent5 },
});

// ───────── helpers ─────────
const shadow = () => ({ type: 'outer', blur: 6, offset: 2, angle: 90, color: '000000', opacity: 0.12 });

function title(s, t) {
  s.addText(t, { placeholder: 'title', ...AR });
}
function text(s, t, o) {
  s.addText(t, { isTextBox: true, fontSize: 15, color: C.text1, valign: 'top', margin: 0.05, ...AR, ...o });
}
function card(s, x, y, w, h, fill = C.background2, name) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { type: 'none' }, shadow: shadow(), objectName: name });
}
function badge(s, x, y, d, label, fill = C.accent1) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: 'none' } });
  s.addText(label, { isTextBox: true, x, y, w: d, h: d, align: 'center', valign: 'middle', fontSize: d > 0.6 ? 20 : 14, bold: true, color: C.background1, margin: 0 });
}
function pill(s, x, y, w, label, fill, size = 12) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.34, rectRadius: 0.17, fill: { color: fill }, line: { type: 'none' } });
  s.addText(label, { isTextBox: true, x, y, w, h: 0.34, align: 'center', valign: 'middle', fontSize: size, bold: true, color: C.background1, margin: 0, fontFace: 'Arial' });
}
// dark code block; lines starting with // are comments
function code(s, lines, x, y, w, h, size = 12, name) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: C.text1 }, line: { type: 'none' }, objectName: name });
  const runs = lines.map((l, i) => ({
    text: l,
    options: {
      color: /^\s*\/\//.test(l) ? C.accent5 : /(^|\s)(await|return|throw|if|const|async)\b/.test(l) ? 'E9A23B' : C.background1,
      breakLine: i < lines.length - 1,
    },
  }));
  s.addText(runs, { isTextBox: true, x: x + 0.12, y: y + 0.1, w: w - 0.24, h: h - 0.2, fontFace: 'Courier New', fontSize: size, valign: 'top', align: 'left', rtlMode: false, margin: 0.05, lineSpacingMultiple: 1.05 });
}
const METHOD = { GET: C.accent1, POST: C.accent2, PATCH: C.accent4, PUT: C.accent4, DELETE: C.accent3 };
// a Postman request + response card
function postman(s, { method, url, status, ok = true, body, x, y, w, h, size = 11 }) {
  card(s, x, y, w, h, C.background2, 'postman-card');
  s.addText('Postman', { isTextBox: true, x: x + 0.15, y: y + 0.08, w: 1.5, h: 0.3, fontSize: 10, bold: true, color: C.accent2, align: 'left', margin: 0 });
  pill(s, x + 0.15, y + 0.42, 0.9, method, METHOD[method], 11);
  s.addText(url, { isTextBox: true, x: x + 1.12, y: y + 0.42, w: w - 1.3, h: 0.34, fontFace: 'Courier New', fontSize: 11, color: C.text1, valign: 'middle', align: 'left', margin: 0, rtlMode: false });
  pill(s, x + w - 1.95, y + 0.08, 1.8, status, ok ? C.accent1 : C.accent3, 11);
  code(s, body, x + 0.15, y + 0.88, w - 0.3, h - 1.03, size);
}
function arrow(s, x1, y1, x2, y2, color = C.accent5) {
  s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, flipH: x2 < x1, line: { color, width: 2, endArrowType: 'triangle' } });
}
function stat(s, x, y, w, big, label, color = C.accent1) {
  s.addText(big, { isTextBox: true, x, y, w, h: 0.95, fontSize: 54, bold: true, color, align: 'center', margin: 0 });
  s.addText(label, { isTextBox: true, x, y: y + 0.95, w, h: 0.45, fontSize: 15, color: C.text1, margin: 0, ...AR, align: 'center' });
}
const slide = (master, section) => pres.addSlide({ masterName: master, sectionTitle: section });

// ═════════════════════════ 1. Title ═════════════════════════
pres.addSection({ title: 'البداية' });
let s = slide('DARK', 'البداية');
s.addText('FreelanceHub', { placeholder: 'title', ...AR });
s.addText('منصة عمل حر عربية تحمي حق صاحب المشروع والمستقل', { placeholder: 'body', ...AR });
s.addText('NestJS · PostgreSQL · Prisma · Redis · BullMQ · JWT', { isTextBox: true, x: 0.7, y: 4.6, w: 11.9, h: 0.5, fontSize: 16, color: C.accent5, align: 'right', margin: 0.05 });
// motif: client -> escrow -> freelancer
[['مستقل', C.accent1], ['ضمان', C.accent2], ['عميل', C.accent4]].forEach(([l, c], i) => {
  const x = 8.9 + i * 1.35;
  badge(s, x, 5.55, 0.95, '', c);
  s.addText(l, { isTextBox: true, x: x - 0.2, y: 5.55, w: 1.35, h: 0.95, fontSize: 15, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, rtlMode: true });
});
s.addNotes('مرحباً. سأعرض مشروع FreelanceHub: الخادم (Back-End) الكامل لمنصة عمل حر عربية. سأحكيه كقصة: المشكلة، الحل، كيف بنيته، ثم نتابع رحلة سارة وأحمد داخل النظام خطوة بخطوة مع الكود والطلبات الحقيقية من Postman، وفي النهاية الإثبات بالاختبارات.');

// ═════════════════════════ 2. Problem ═════════════════════════
s = slide('CONTENT', 'البداية');
title(s, 'المشكلة: العمل الحر عبر واتساب وفيسبوك');
const problems = [
  ['صاحب المشروع يدفع', 'ثم لا يستلم شيئاً، أو يستلم عملاً ناقصاً ولا يسترجع ماله'],
  ['المستقل يسلّم العمل', 'ثم يختفي العميل دون أن يدفع'],
  ['لا يوجد سجل حقيقي', 'لا تقييمات من عملاء سابقين ولا تاريخ للمستقل'],
  ['فوضى العروض', 'عشرات الرسائل ولا طريقة مرتبة لمقارنتها'],
];
problems.forEach(([h, d], i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = 6.9 - col * 6.3, y = 1.55 + row * 2.6;
  card(s, x, y, 5.85, 2.25, C.background2, `problem-${i + 1}`);
  badge(s, x + 4.95, y + 0.35, 0.7, String(i + 1), C.accent3);
  text(s, h, { x: x + 0.3, y: y + 0.35, w: 4.5, h: 0.6, fontSize: 21, bold: true });
  text(s, d, { x: x + 0.3, y: y + 1.0, w: 5.25, h: 1.05, fontSize: 16, color: C.text2 });
});
s.addNotes('هذه المشاكل من وصف المشروع. القاسم المشترك: لا أحد يضمن المال. لذلك قلب المنصة هو الضمان المالي، وكل ما بنيته يدور حوله.');

// ═════════════════════════ 3. Solution ═════════════════════════
s = slide('CONTENT', 'البداية');
title(s, 'الحل: المال يُحجز ثم يُحرَّر على مراحل');
const flow = [
  ['محفظة سارة', ['متاح', '600'], C.accent4],
  ['محجوز Escrow', ['عند قبول العرض', '500'], C.accent2],
  ['مراحل العقد', ['ثلاث دفعات', '100 · 250 · 150'], C.text2],
  ['عند كل موافقة', ['للمستقل / للمنصة', '90% / 10%'], C.accent1],
];
flow.forEach(([h, d, c], i) => {
  const x = 10.25 - i * 3.15;
  card(s, x, 2.0, 2.65, 2.0, c, `flow-${i + 1}`);
  s.addText(h, { isTextBox: true, x: x + 0.1, y: 2.25, w: 2.45, h: 0.6, fontSize: 19, bold: true, color: C.background1, align: 'center', margin: 0, rtlMode: true });
  s.addText(d[0], { isTextBox: true, x: x + 0.1, y: 2.85, w: 2.45, h: 0.4, fontSize: 14, color: C.background1, align: 'center', margin: 0, rtlMode: true });
  s.addText(d[1], { isTextBox: true, x: x + 0.1, y: 3.25, w: 2.45, h: 0.55, fontSize: 22, bold: true, color: C.background1, align: 'center', margin: 0 });
  if (i < 3) arrow(s, x - 0.05, 3.0, x - 0.45, 3.0, C.accent5);
});
text(s, 'المال لم يعد للعميل ولم يصل للمستقل بعد: المستقل يضمن أن المال موجود، والعميل يضمن أنه لن يدفع إلا مقابل عمل استلمه.', { x: 0.6, y: 4.5, w: 12.13, h: 0.9, fontSize: 18, color: C.text1 });
text(s, 'آخر مرحلة تُكمل العقد والمشروع، وأي مبلغ محجوز متبقٍ يرجع لرصيد العميل', { x: 0.6, y: 5.5, w: 12.13, h: 0.6, fontSize: 16, color: C.accent6, italic: true });
s.addNotes('الحل بكلمة: Escrow أي ضمان. عند قبول العرض ينتقل المبلغ من الرصيد المتاح إلى المحجوز. ثم يُقسم العقد لمراحل، وكل موافقة على مرحلة تحرر مبلغها: 90% للمستقل و10% عمولة للمنصة. وإن كان مجموع المراحل أقل من العقد، يرجع الباقي للعميل.');

// ═════════════════════════ 4. Actors / use cases ═════════════════════════
s = slide('CONTENT', 'البداية');
title(s, 'من يستخدم المنصة؟');
s.addImage({ path: path.join(DOCS, 'use-case.png'), x: 0.6, y: 1.3, w: 3.12, h: 5.6, altText: 'Use case diagram', objectName: 'use-case' });
const actors = [
  ['زائر', 'يتصفح المشاريع والمستقلين ويسجّل حساباً', C.accent5],
  ['صاحب مشروع', 'ينشر، يقارن العروض، يقبل، يقسّم لمراحل، يوافق ويدفع', C.accent4],
  ['مستقل', 'ملف ومهارات، يقدّم العروض، يسلّم المراحل، يسحب أرباحه', C.accent1],
  ['مدير المنصة', 'التصنيفات والمهارات، الحظر، لوحة الأرقام والأرباح', C.accent2],
  ['المجدول + البريد', 'يلغي المشاريع المنتهية كل منتصف ليل، ويرسل الإيميلات', C.text2],
];
actors.forEach(([h, d, c], i) => {
  const y = 1.35 + i * 1.12;
  card(s, 4.2, y, 8.53, 0.95, C.background2, `actor-${i + 1}`);
  badge(s, 11.95, y + 0.15, 0.65, '', c);
  text(s, h, { x: 9.1, y: y + 0.08, w: 2.7, h: 0.4, fontSize: 18, bold: true });
  text(s, d, { x: 4.4, y: y + 0.47, w: 7.4, h: 0.42, fontSize: 14, color: C.text2 });
});
s.addNotes('من التحليل استخرجت ثلاثة أدوار بشرية وجهتين نظاميتين، و24 حالة استخدام في المخطط على اليسار. حساب المدير لا يُنشأ من التسجيل أبداً، بل يُنشأ تلقائياً عند إقلاع التطبيق من متغيرات البيئة.');

// ═════════════════════════ 5. Stack ═════════════════════════
s = slide('CONTENT', 'البداية');
title(s, 'التقنيات: ولماذا كل واحدة؟');
const stack = [
  ['NestJS + TypeScript', 'بنية ثابتة: Module · Controller · Service'],
  ['PostgreSQL 16', 'معاملات (Transactions) قوية للمال'],
  ['Prisma ORM', 'كود TypeScript آمن بدل SQL + Migrations'],
  ['Redis', 'كاش مشترك وسريع جداً'],
  ['BullMQ', 'طوابير: بريد بالخلفية + مهمة منتصف الليل'],
  ['JWT + bcrypt', 'هوية موقّعة، كلمات سر غير قابلة للقراءة'],
  ['class-validator', 'فحص كل مدخل عبر الـ DTO'],
  ['Throttler + Helmet', 'الحماية من الإساءة والإغراق'],
  ['Swagger + Postman + Jest', 'توثيق وإثبات بالاختبارات'],
];
stack.forEach(([h, d], i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = 8.83 - col * 4.12, y = 1.45 + row * 1.85;
  card(s, x, y, 3.9, 1.6, C.background2, `tech-${i + 1}`);
  s.addText(h, { isTextBox: true, x: x + 0.2, y: y + 0.2, w: 3.5, h: 0.5, fontSize: 18, bold: true, color: C.accent6, align: 'left', margin: 0 });
  text(s, d, { x: x + 0.2, y: y + 0.75, w: 3.5, h: 0.7, fontSize: 14, color: C.text2 });
});
s.addNotes('اتبعت الدليل كمرجع: NestJS وPrisma وPostgreSQL للأساس، وJWT للهوية، وRedis للكاش والطوابير. اخترت PostgreSQL لأن التعامل مع المال يحتاج معاملات حقيقية: إما أن تنجح كل الخطوات أو لا شيء.');

// ═════════════════════════ 6. Request lifecycle ═════════════════════════
pres.addSection({ title: 'البنية' });
s = slide('CONTENT', 'البنية');
title(s, 'رحلة الطلب داخل NestJS');
const steps = [
  ['ThrottlerGuard', '429', C.accent3],
  ['JwtAuthGuard', '401', C.accent3],
  ['RolesGuard', '403', C.accent3],
  ['ValidationPipe', '400', C.accent3],
  ['Controller', 'يستقبل', C.accent4],
  ['Service', 'المنطق', C.accent1],
  ['Prisma ⇄ DB', 'المعاملة', C.accent6],
];
steps.forEach(([h, d, c], i) => {
  const x = 0.6 + i * 1.79;
  card(s, x, 1.6, 1.55, 1.25, C.background2, `step-${i + 1}`);
  s.addText(h, { isTextBox: true, x: x + 0.05, y: 1.72, w: 1.45, h: 0.55, fontSize: 13, bold: true, color: C.text1, align: 'center', margin: 0 });
  pill(s, x + 0.25, 2.35, 1.05, d, c, 11);
  if (i < steps.length - 1) arrow(s, x + 1.57, 2.22, x + 1.77, 2.22);
});
text(s, 'الحراس مسجّلون عامّين (APP_GUARD): أي endpoint جديد محمي تلقائياً، ولا يصبح عاماً إلا بـ @Public() عمداً', { x: 0.6, y: 3.15, w: 12.13, h: 0.6, fontSize: 16, color: C.accent6 });
code(s, [
  '@Roles(Role.CLIENT)            // RolesGuard',
  "@Post('proposals/:id/accept')",
  'accept(@Param(\'id\', ParseIntPipe) id: number,',
  '       @CurrentUser() user: AuthUser) {',
  '  return this.proposals.accept(id, user);',
  '}                               // no logic here',
], 0.6, 3.95, 7.4, 2.45, 13, 'code-controller');
card(s, 8.3, 3.95, 4.43, 2.45, C.background2, 'module-note');
text(s, 'كل ميزة = موديول مستقل', { x: 8.5, y: 4.1, w: 4.03, h: 0.45, fontSize: 18, bold: true });
s.addText('dto · controller · service · module', { isTextBox: true, x: 8.5, y: 4.6, w: 4.03, h: 0.4, fontFace: 'Courier New', fontSize: 12, color: C.accent6, align: 'right', margin: 0.05 });
text(s, 'المشروع فيه 16 موديولاً منفصلاً', { x: 8.5, y: 5.05, w: 4.03, h: 0.4, fontSize: 14, color: C.text2 });
s.addText('auth · projects · proposals · contracts\nwallet · reviews · notifications · jobs', { isTextBox: true, x: 8.5, y: 5.45, w: 4.03, h: 0.8, fontFace: 'Courier New', fontSize: 11, color: C.text2, align: 'right', margin: 0.05 });
s.addNotes('كل طلب يمر بالترتيب: حد الطلبات، ثم التوكن، ثم الدور، ثم التحقق من البيانات، وبعدها يصل للـ Controller الذي لا يحوي منطقاً بل يمرر للـ Service. أي فشل يوقف الطلب فوراً بالكود المناسب، والأخطاء كلها تخرج بشكل واحد من AllExceptionsFilter.');

// ═════════════════════════ 7. Database ═════════════════════════
s = slide('CONTENT', 'البنية');
title(s, 'قاعدة البيانات: أهم الجداول والعلاقات');
{
  const BW = 2.45, BH = 1.62, COL = [0.6, 3.83, 7.06, 10.29], ROW = [1.3, 3.28, 5.26];
  const box = (c, r, en, ar, fields, color) => {
    const x = COL[c], y = ROW[r];
    card(s, x, y, BW, BH, C.background2, `table-${en}`);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: BW, h: 0.4, rectRadius: 0.12, fill: { color }, line: { type: 'none' } });
    s.addShape(pres.shapes.RECTANGLE, { x, y: y + 0.25, w: BW, h: 0.15, fill: { color }, line: { type: 'none' } });
    s.addText(en, { isTextBox: true, x: x + 0.12, y, w: 1.45, h: 0.4, fontSize: 14, bold: true, color: C.background1, align: 'left', valign: 'middle', margin: 0 });
    s.addText(ar, { isTextBox: true, x: x + 1.5, y, w: BW - 1.62, h: 0.4, fontSize: 12, color: C.background1, align: 'right', valign: 'middle', margin: 0, rtlMode: true });
    s.addText(fields.map((f, i) => ({ text: f, options: { breakLine: i < fields.length - 1, bold: /UNIQUE|PK/.test(f), color: /UNIQUE/.test(f) ? C.accent3 : C.text1 } })),
      { isTextBox: true, x: x + 0.12, y: y + 0.46, w: BW - 0.24, h: BH - 0.52, fontFace: 'Courier New', fontSize: 10.5, align: 'left', valign: 'top', margin: 0, paraSpaceAfter: 1 });
  };
  // relationship line with a cardinality label
  const rel = (x1, y1, x2, y2, label) => {
    s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, line: { color: C.accent5, width: 1.75 } });
    const lx = (x1 + x2) / 2 - 0.36, ly = (y1 + y2) / 2 - 0.15;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: lx, y: ly, w: 0.72, h: 0.3, rectRadius: 0.15, fill: { color: C.background1 }, line: { color: C.accent5, width: 1 } });
    s.addText(label, { isTextBox: true, x: lx, y: ly, w: 0.72, h: 0.3, fontSize: 10, bold: true, color: C.text1, align: 'center', valign: 'middle', margin: 0 });
  };
  const ACC = C.accent4, PRJ = C.accent1, MON = C.accent2, CON = C.text2;
  box(0, 0, 'User', 'المستخدم', ['id PK', 'email UNIQUE', 'role', 'isBanned'], ACC);
  box(0, 1, 'Wallet', 'المحفظة', ['userId UNIQUE', 'balance', 'heldBalance'], MON);
  box(0, 2, 'Transaction', 'الحركات', ['walletId FK', 'type', 'amount  Decimal'], MON);
  box(1, 0, 'Project', 'المشروع', ['clientId FK', 'categoryId FK', 'budgetMin / Max', 'status · deletedAt'], PRJ);
  box(1, 1, 'Category', 'التصنيف', ['id PK', 'name UNIQUE'], PRJ);
  box(2, 0, 'Proposal', 'العرض', ['projectId FK', 'freelancerId FK', 'price · status', 'UNIQUE(project,', '       freelancer)'], PRJ);
  box(2, 1, 'Contract', 'العقد', ['projectId UNIQUE', 'proposalId UNIQUE', 'amount', 'escrowBalance'], CON);
  box(2, 2, 'Review', 'التقييم', ['contractId FK', 'rating 1..5', 'UNIQUE(contract,', '       reviewer)'], CON);
  box(3, 1, 'Milestone', 'المرحلة', ['contractId FK', 'amount', 'status'], CON);
  box(3, 2, 'Submission', 'التسليم', ['milestoneId FK', 'note', 'files (private)'], CON);
  const mid = (r) => ROW[r] + BH / 2, cx = (c) => COL[c] + BW / 2;
  rel(COL[0] + BW, mid(0), COL[1], mid(0), '1 : N');          // User -> Project
  rel(COL[1] + BW, mid(0), COL[2], mid(0), '1 : N');          // Project -> Proposal
  rel(cx(0), ROW[0] + BH, cx(0), ROW[1], '1 : 1');            // User -> Wallet
  rel(cx(0), ROW[1] + BH, cx(0), ROW[2], '1 : N');            // Wallet -> Transaction
  rel(cx(1), ROW[0] + BH, cx(1), ROW[1], 'N : 1');            // Project -> Category
  rel(cx(2), ROW[0] + BH, cx(2), ROW[1], '1 : 1');            // Proposal -> Contract
  rel(COL[2] + BW, mid(1), COL[3], mid(1), '1 : N');          // Contract -> Milestone
  rel(cx(2), ROW[1] + BH, cx(2), ROW[2], '1 : 2');            // Contract -> Review
  rel(cx(3), ROW[1] + BH, cx(3), ROW[2], '1 : N');            // Milestone -> Submission
  // legend card (top-right)
  card(s, COL[3], ROW[0], BW, BH, C.background1, 'legend');
  text(s, '17 جدولاً — هنا أهم 10', { x: COL[3] + 0.12, y: ROW[0] + 0.08, w: BW - 0.24, h: 0.4, fontSize: 15, bold: true });
  text(s, [
    { text: 'أزرق: الحسابات', options: { breakLine: true, color: C.accent4 } },
    { text: 'أخضر: المشاريع والعروض', options: { breakLine: true, color: C.accent6 } },
    { text: 'ذهبي: المال', options: { breakLine: true, color: C.accent2 } },
    { text: 'كحلي: العقد والمراحل', options: { color: C.text2 } },
  ], { x: COL[3] + 0.12, y: ROW[0] + 0.5, w: BW - 0.24, h: 1.05, fontSize: 12, bold: true });
}
s.addNotes('هذه أهم عشرة جداول من سبعة عشر. القصة تمشي من اليسار لليمين: المستخدم (صاحب المشروع) ينشر مشاريع، كل مشروع يستقبل عروضاً، والعرض المقبول يصبح عقداً واحداً، والعقد يُقسم لمراحل، وكل مرحلة لها تسليمات، وبعد الاكتمال تقييمان: واحد من كل طرف. وعلى اليسار المال: لكل مستخدم محفظة واحدة فيها رصيد متاح ومحجوز، وكل حركة مسجلة في جدول الحركات. الأحمر في الصناديق هو قيود UNIQUE التي تحمي القواعد حتى مع الضغط المزدوج: عرض واحد لكل مستقل على المشروع، عقد واحد لكل مشروع، تقييم واحد لكل طرف.');

// ═════════════════════════ 7b. Full ERD + key constraints ═════════════════════════
s = slide('CONTENT', 'البنية');
title(s, 'المخطط الكامل والقيود المهمة');
s.addImage({ path: path.join(DOCS, 'erd.png'), x: 0.6, y: 1.35, w: 7.25, h: 5.52, altText: 'Entity relationship diagram', objectName: 'erd' });
const rules = [
  ['UNIQUE (projectId, freelancerId)', 'عرض واحد لكل مستقل على المشروع'],
  ['Contract.projectId UNIQUE', 'عقد واحد لكل مشروع'],
  ['UNIQUE (contractId, reviewerId)', 'تقييم واحد لكل طرف'],
  ['Decimal(14,2)', 'المال دقيق حتى آخر سنت'],
  ['deletedAt', 'حذف ناعم: يختفي ويبقى'],
  ['GIN pg_trgm', 'بحث سريع داخل النص'],
];
rules.forEach(([h, d], i) => {
  const y = 1.35 + i * 0.93;
  card(s, 8.1, y, 4.63, 0.8, C.background2, `rule-${i + 1}`);
  s.addText(h, { isTextBox: true, x: 8.25, y: y + 0.05, w: 4.35, h: 0.35, fontFace: 'Courier New', fontSize: 12, bold: true, color: C.accent6, align: 'left', margin: 0 });
  text(s, d, { x: 8.25, y: y + 0.4, w: 4.35, h: 0.35, fontSize: 13, color: C.text2 });
});
s.addNotes('صممت قاعدة البيانات بنفسي من الوصف. أهم فكرة: القواعد الحرجة مفروضة داخل قاعدة البيانات نفسها بقيود UNIQUE، فلا يمكن كسرها حتى لو وصل طلبان في نفس اللحظة. والمال Decimal وليس float، لأن 0.1 + 0.2 لا يساوي 0.3 في الأرقام العادية.');

// ═════════════════════════ 8. Story divider ═════════════════════════
pres.addSection({ title: 'القصة' });
s = slide('DARK', 'القصة');
s.addText('القصة: سارة وأحمد', { placeholder: 'title', ...AR });
s.addText('نتابع رحلة حقيقية داخل النظام، مع الكود وطلبات Postman', { placeholder: 'body', ...AR });
s.addNotes('الآن نتابع القصة الموجودة في الوصف: سارة صاحبة متجر تريد تطبيقاً، وأحمد وليلى وخالد مستقلون. كل خطوة سأريكم الكود الذي ينفذها والطلب الحقيقي من Postman.');

// ═════════════════════════ 9. Publish ═════════════════════════
s = slide('CONTENT', 'القصة');
title(s, 'اليوم الأول: سارة تشحن محفظتها وتنشر مشروعها');
postman(s, {
  method: 'POST', url: '/api/projects   (form-data + attachment)', status: '201 Created', x: 0.6, y: 1.35, w: 6.4, h: 4.1,
  body: ['{', '  "id": 12,', '  "title": "تطبيق موبايل لمتجر ملابس",', '  "budgetMin": "400",  "budgetMax": "600",', '  "deadline": "2026-11-26T10:00:00.000Z",', '  "status": "OPEN",', '  "attachments": [ { "url": "/uploads/attachments/…png" } ],', '  "proposalsCount": 0', '}'],
});
code(s, [
  '// CreateProjectDto (class-validator)',
  '@IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()',
  'budgetMin: number;',
  '@Type(() => Date) @IsDate()',
  "@MinDate(() => new Date())   // deadline in future",
  'deadline: Date;',
], 7.3, 1.35, 5.43, 1.95, 12, 'code-dto');
card(s, 7.3, 3.5, 5.43, 1.95, C.background2, 'publish-rules');
text(s, [
  { text: '✓ ميزانية من–إلى، وآخر موعد للعروض', options: { breakLine: true } },
  { text: '✓ حتى 5 مرفقات: صور أو PDF أو ZIP', options: { breakLine: true } },
  { text: '✓ أسماء ملفات عشوائية يحددها الخادم', options: {} },
], { x: 7.5, y: 3.65, w: 5.03, h: 1.65, fontSize: 15, color: C.text2, paraSpaceAfter: 6 });
text(s, 'بيانات خاطئة (ميزانية من > إلى، موعد في الماضي، حقل غريب مثل status) ← 400 مع رسالة واضحة', { x: 0.6, y: 5.75, w: 12.13, h: 0.6, fontSize: 16, color: C.accent3 });
s.addNotes('سارة تشحن 600 دولار ثم تنشر المشروع كـ form-data لأنه يحمل ملفات. الـ DTO يرفض أي بيانات خاطئة قبل أن تصل للمنطق، وValidationPipe مع whitelist يرفض أي حقل غير معرّف، فلا يستطيع أحد مثلاً إرسال status=COMPLETED.');

// ═════════════════════════ 10. Sessions & theft ═════════════════════════
s = slide('CONTENT', 'القصة');
title(s, 'الأمان: جلسة لكل جهاز، وكشف المفتاح المسروق');
[['15 دقيقة', 'عمر مفتاح الدخول'], ['7 أيام', 'البقاء داخلاً'], ['فوري', 'الحظر والخروج']].forEach(([b, l], i) => {
  stat(s, 9.0 - i * 2.85, 1.3, 2.6, b, l, i === 2 ? C.accent3 : C.accent1);
});
code(s, [
  '// refresh(): compare-and-swap on the CURRENT token',
  'const { count } = await prisma.session.updateMany({',
  '  where: { id: session.id, refreshHash: hash(presented) },',
  '  data:  { refreshHash: hash(newToken), lastUsedAt: new Date() },',
  '});',
  'if (count === 0) {   // an OLD token came back = stolen',
  '  await prisma.session.deleteMany({ where: { userId } });',
  "  throw new UnauthorizedException('reuse detected');",
  '}',
], 0.6, 3.15, 6.9, 2.95, 12, 'code-refresh');
postman(s, {
  method: 'POST', url: '/api/auth/refresh   (old token)', status: '401 Unauthorized', ok: false, x: 7.75, y: 3.15, w: 4.98, h: 2.95, size: 11,
  body: ['{', '  "statusCode": 401,', '  "error": "UNAUTHORIZED",', '  "message": "Refresh token', '   reuse detected: all sessions', '   were ended, please log in', '   again"', '}'],
});
s.addNotes('الوصف طلب حالة أمنية: إذا استُخدم مفتاح تجديد قديم فهو غالباً مسروق، فننهي كل الجلسات. الجلسة عندي = جهاز، ومفتاحها يتبدل مع كل تجديد. التحديث مشروط بأن المفتاح هو الحالي، فإن لم يطابق شيء فهذا مفتاح قديم: نحذف كل جلسات المستخدم. وJwtStrategy يفحص الجلسة والحظر مع كل طلب، لذلك الحظر والخروج فوريان.');

// ═════════════════════════ 11. Proposals ═════════════════════════
s = slide('CONTENT', 'القصة');
title(s, 'اليوم 1–2: العروض — عرض واحد مهما حصل');
postman(s, {
  method: 'POST', url: '/api/projects/12/proposals   (2nd time)', status: '409 Conflict', ok: false, x: 0.6, y: 1.35, w: 6.4, h: 2.7,
  body: ['{', '  "statusCode": 409,', '  "message": "You already submitted a', '              proposal on this project"', '}'],
});
code(s, [
  '// schema.prisma',
  'model Proposal {',
  '  ...',
  '  @@unique([projectId, freelancerId])',
  '}',
  '// service: the DB rejects the duplicate -> P2002',
  "if (err.code === 'P2002') throw new ConflictException(...)",
], 0.6, 4.25, 6.4, 2.55, 12, 'code-unique');
const pr = [
  ['قيد UNIQUE في قاعدة البيانات', 'حتى لو وصل طلبان في نفس الجزء من الثانية'],
  ['20 عرضاً في اليوم لكل مستقل', 'يُعدّ في القاعدة لآخر 24 ساعة ← 429'],
  ['السحب = حالة WITHDRAWN', 'لا يُحذف، فلا يُقدَّم عرض ثانٍ'],
  ['سارة تقارن العروض', 'صفحة صفحة، مرتبة بالسعر، مع تقييم كل مستقل'],
];
pr.forEach(([h, d], i) => {
  const y = 1.35 + i * 1.37;
  card(s, 7.3, y, 5.43, 1.2, C.background2, `prop-${i + 1}`);
  text(s, h, { x: 7.5, y: y + 0.12, w: 5.03, h: 0.45, fontSize: 17, bold: true });
  text(s, d, { x: 7.5, y: y + 0.6, w: 5.03, h: 0.5, fontSize: 14, color: C.text2 });
});
s.addNotes('أحمد وليلى وخالد يقدّمون عروضهم، وسارة يصلها إشعار مع كل عرض. القاعدة "عرض واحد مهما حصل" لم أعتمد فيها على فحص في الكود فقط، بل على قيد UNIQUE في قاعدة البيانات: لو ضغط أحمد مرتين بسرعة، تقبل القاعدة واحداً وترفض الآخر، وأحوّل خطأ P2002 إلى 409 برسالة واضحة.');

// ═════════════════════════ 12. Accept ═════════════════════════
s = slide('CONTENT', 'القصة');
title(s, 'اليوم الثالث: أهم لحظة — قبول العرض');
code(s, [
  'return prisma.$transaction(async (tx) => {   // all or nothing',
  '  // 1. project OPEN -> IN_PROGRESS (only if still OPEN)',
  '  await tx.project.updateMany({ where: { id, status: OPEN }, ... })',
  '  // 2. balance -= 500, held += 500 (only if balance >= 500)',
  '  await tx.wallet.updateMany({',
  '    where: { balance: { gte: price } }, ... })',
  '  // 3. ledger: ESCROW_HOLD',
  '  // 4. create Contract (projectId UNIQUE)',
  '  // 5. this proposal ACCEPTED, the others REJECTED',
  '});',
  '// 6. after commit: notifications + emails -> queue',
], 0.6, 1.35, 7.25, 3.65, 12, 'code-accept');
postman(s, {
  method: 'POST', url: '/api/proposals/31/accept', status: '200 OK', x: 8.1, y: 1.35, w: 4.63, h: 3.65, size: 11,
  body: ['{', '  "contractId": 7,', '  "projectId": 12,', '  "projectStatus":', '      "IN_PROGRESS",', '  "amount": "500",', '  "durationDays": 20', '}'],
});
[['600 / 0', 'قبل: متاح / محجوز', C.accent4], ['100 / 500', 'بعد: متاح / محجوز', C.accent2], ['< 100ms', 'الرد فوري، البريد بالخلفية', C.accent1]].forEach(([b, l, c], i) => {
  const x = 8.6 - i * 4.0;
  s.addText(b, { isTextBox: true, x, y: 5.4, w: 3.8, h: 0.75, fontSize: 36, bold: true, color: c, align: 'center', margin: 0 });
  s.addText(l, { isTextBox: true, x, y: 6.15, w: 3.8, h: 0.4, fontSize: 14, color: C.text2, align: 'center', margin: 0, rtlMode: true });
});
s.addNotes('هذه أهم لحظة في المنصة. الوصف يقول: لا نقبل أبداً أن يُخصم المال ولا يُنشأ العقد، أو العكس. لذلك الخطوات الخمس داخل معاملة واحدة: أي خطأ، مثل رصيد غير كافٍ، يلغي كل شيء تلقائياً ويرجع 402. والبريد لا ينتظره العميل: يُرسل بعد نجاح المعاملة عبر طابور في الخلفية.');

// ═════════════════════════ 13. Concurrency ═════════════════════════
s = slide('CONTENT', 'القصة');
title(s, 'ماذا لو ضغط زرين في نفس الثانية؟');
card(s, 6.85, 1.35, 5.88, 2.05, C.background2, 'wrong');
text(s, 'خطأ: افحص ثم نفّذ', { x: 7.05, y: 1.45, w: 5.48, h: 0.45, fontSize: 18, bold: true, color: C.accent3 });
code(s, ["if (project.status === 'OPEN')", '  await update(...)', '// two requests both read OPEN -> both win'], 7.05, 1.95, 5.48, 1.25, 12, 'code-wrong');
card(s, 0.6, 1.35, 5.98, 2.05, C.background2, 'right');
text(s, 'صحيح: اجعل الفحص جزءاً من التنفيذ', { x: 0.8, y: 1.45, w: 5.58, h: 0.45, fontSize: 18, bold: true, color: C.accent1 });
code(s, ['const { count } = await tx.project.updateMany({', "  where: { id, status: 'OPEN' }, data: {...} })", "if (count === 0) throw new ConflictException()"], 0.8, 1.95, 5.58, 1.25, 12, 'code-right');
const cases = [
  ['قبول عرضين مختلفين معاً (موبايل + لابتوب)', 'واحد ينجح، الآخر 409، المال يُحجز مرة واحدة'],
  ['«موافقة» مرتين على مرحلة', 'دفعة واحدة فقط، الثانية 409'],
  ['سحبان معاً أكبر من الرصيد', 'لا يصبح الرصيد سالباً أبداً (402)'],
  ['مرحلتان معاً تتجاوزان العقد', 'قفل صف على العقد حتى تنتهي المعاملة'],
];
cases.forEach(([h, d], i) => {
  const y = 3.75 + i * 0.75;
  if (i > 0) s.addShape(pres.shapes.LINE, { x: 0.6, y: y - 0.08, w: 12.13, h: 0, line: { color: 'D5DEE8', width: 0.75 } });
  text(s, h, { x: 6.85, y, w: 5.88, h: 0.6, fontSize: 15, bold: true });
  text(s, d, { x: 0.6, y, w: 6.0, h: 0.6, fontSize: 15, color: C.accent6 });
});
s.addNotes('الوصف سأل: ماذا لو حصل هذا مرتين في نفس اللحظة؟ الحل الذي طبقته في كل العمليات المالية: لا أفحص ثم أنفذ، بل أضع الشرط داخل جملة التحديث نفسها، وقاعدة البيانات تضمن أن واحداً فقط يطابق. كل هذه الحالات مختبرة بطلبات متوازية حقيقية في الاختبارات.');

// ═════════════════════════ 14. Milestones & payment ═════════════════════════
s = slide('CONTENT', 'القصة');
title(s, 'اليوم 4–20: المراحل والدفع 90 / 10');
const rows = [
  ['الحدث', 'سارة متاح', 'محجوز', 'أحمد', 'المنصة'],
  ['قبول العرض', '100', '500', '0', '0'],
  ['اعتماد المرحلة الأولى بعد طلب تعديل', '100', '400', '90', '10'],
  ['اعتماد المرحلة الثانية', '100', '150', '315', '35'],
  ['اعتماد المرحلة الثالثة: اكتمل العقد', '100', '0', '450', '50'],
];
s.addTable(rows.map((r, ri) => r.slice().reverse().map((c, ci) => ({
  text: c,
  options: {
    bold: ri === 0 || ri === 4, fontSize: 15, rtlMode: true, align: ci === 4 ? 'right' : 'center', valign: 'middle',
    color: ri === 0 ? C.background1 : ri === 4 && ci <= 1 ? C.accent6 : C.text1,
    fill: { color: ri === 0 ? C.text1 : ri % 2 ? C.background1 : C.background2 },
  },
}))), { x: 0.6, y: 1.35, w: 12.13, colW: [1.5, 1.5, 1.5, 1.6, 6.03], rowH: 0.52, border: { type: 'solid', pt: 0.5, color: 'D5DEE8' }, objectName: 'story-table' });
code(s, [
  '// common/money.ts — never lose a cent',
  'commission = amount.mul(0.10).toDecimalPlaces(2)',
  'payout     = amount.sub(commission)   // the rest',
], 0.6, 4.35, 6.3, 1.4, 12, 'code-split');
postman(s, {
  method: 'POST', url: '/api/milestones/19/approve', status: '200 OK', x: 7.15, y: 4.25, w: 5.58, h: 2.05, size: 11,
  body: ['{ "payout": "90", "commission": "10",', '  "contractStatus": "ACTIVE" }', '// second click -> 409 Conflict'],
});
text(s, 'دورة المرحلة: بانتظار العمل ← تم التسليم ← (طلب تعديل ↺) ← تمت الموافقة', { x: 0.6, y: 5.95, w: 6.3, h: 0.8, fontSize: 15, color: C.accent6 });
s.addNotes('سارة تقسم العقد إلى 100 و250 و150، والنظام يرفض أي مرحلة تجعل المجموع أكبر من العقد. أحمد يسلّم ملفات خاصة لا يراها إلا الطرفان والمدير، وسارة تطلب تعديلاً ثم توافق. كل موافقة معاملة واحدة: تخرج من المحجوز، 90% لأحمد و10% للمنصة، وكل حركة مسجلة. بعد الأخيرة يصبح رصيد أحمد 450 والمنصة 50، تماماً كما في القصة.');

// ═════════════════════════ 15. Background ═════════════════════════
pres.addSection({ title: 'خلف الكواليس' });
s = slide('CONTENT', 'خلف الكواليس');
title(s, 'في الخلفية: الإشعارات، البريد، ومهمة منتصف الليل');
const q = [['ProposalsService', 'يرد فوراً', C.accent4], ['BullMQ Queue', 'طابور محفوظ في Redis', C.accent2], ['MailProcessor', 'يرسل بالخلفية', C.accent1], ['nodemailer', 'خدمة البريد SMTP', C.text2]];
q.forEach(([h, d, c], i) => {
  const x = 10.0 - i * 3.13;
  card(s, x, 1.4, 2.73, 1.3, c, `queue-${i + 1}`);
  s.addText(h, { isTextBox: true, x: x + 0.1, y: 1.5, w: 2.53, h: 0.6, fontSize: 15, bold: true, color: C.background1, align: 'center', margin: 0 });
  s.addText(d, { isTextBox: true, x: x + 0.1, y: 2.1, w: 2.53, h: 0.45, fontSize: 13, color: C.background1, align: 'center', margin: 0, rtlMode: true });
  if (i < 3) arrow(s, x - 0.05, 2.05, x - 0.35, 2.05);
});
code(s, [
  '// mail.constants.ts — the provider is sometimes down',
  "{ attempts: 5, backoff: { type: 'exponential', delay: 5000 } }",
  '// retries after 5s, 10s, 20s, 40s, 80s',
  '',
  '// jobs.service.ts — every day at 00:00',
  "queue.upsertJobScheduler('expire-projects',",
  "  { pattern: '0 0 * * *', tz: 'Asia/Damascus' }, ...)",
], 0.6, 3.0, 7.0, 2.55, 12, 'code-queue');
card(s, 7.85, 3.0, 4.88, 3.55, C.background2, 'events');
text(s, 'سبعة أحداث تُبلَّغ', { x: 8.05, y: 3.1, w: 4.48, h: 0.45, fontSize: 18, bold: true });
text(s, [
  { text: '✓ عرض جديد ← صاحب المشروع', options: { breakLine: true } },
  { text: '✓ قبول العرض ← المستقل المقبول', options: { breakLine: true } },
  { text: '✓ رفض العرض ← بقية المستقلين', options: { breakLine: true } },
  { text: '✓ تسليم مرحلة ← صاحب المشروع', options: { breakLine: true } },
  { text: '✓ موافقة أو طلب تعديل ← المستقل', options: { breakLine: true } },
  { text: '✓ وصول دفعة ← المستقل', options: { breakLine: true } },
  { text: '✓ إلغاء تلقائي ← الجميع', options: {} },
], { x: 8.05, y: 3.6, w: 4.48, h: 2.85, fontSize: 14, color: C.text2, paraSpaceAfter: 3 });
text(s, 'إن تعطلت خدمة البريد لا تضيع الرسالة: تُعاد تلقائياً بفاصل يتضاعف', { x: 0.6, y: 5.75, w: 7.0, h: 0.75, fontSize: 15, color: C.accent6 });
s.addNotes('عند قبول عرض عليه 20 مستقلاً لا ينتظر العميل 21 رسالة. NotificationsService يحفظ إشعارات داخل المنصة ويضع الإيميلات في طابور BullMQ داخل Redis، وWorker منفصل يرسلها. إن تعطلت خدمة البريد تُعاد المحاولة 5 مرات بفاصل يتضاعف، فلا تضيع رسالة. ومهمة منتصف الليل مجدولة في Redis أيضاً، فتعمل مرة واحدة حتى مع عدة نسخ من السيرفر، وتلغي المشاريع المنتهية وتبلّغ أصحابها.');

// ═════════════════════════ 16. Performance ═════════════════════════
s = slide('CONTENT', 'خلف الكواليس');
title(s, 'السرعة مع عشرات الآلاف: كاش وفهارس');
const perf = [
  ['تصفح المشاريع', 'فهارس مركّبة + GIN trigram للبحث + كاش 60 ثانية', '60s'],
  ['الملف الشخصي', 'تقييم وعدد مشاريع محسوبة مسبقاً + كاش يُبطَل فوراً', 'فوري'],
  ['التصنيفات والمهارات', 'كاش في Redis، يُحذف عند أي تعديل من المدير', 'فوري'],
  ['لوحة المدير', 'حسابات ثقيلة (groupBy, SUM شهري) مخزّنة', '5 min'],
];
perf.forEach(([h, d, b], i) => {
  const y = 1.4 + i * 1.3;
  card(s, 0.6, y, 12.13, 1.1, C.background2, `perf-${i + 1}`);
  pill(s, 0.85, y + 0.38, 1.3, b, C.accent1, 13);
  text(s, h, { x: 8.8, y: y + 0.12, w: 3.7, h: 0.45, fontSize: 18, bold: true });
  text(s, d, { x: 2.5, y: y + 0.6, w: 10.0, h: 0.42, fontSize: 14, color: C.text2 });
});
text(s, 'الوصف سمح بتأخر ظهور مشروع جديد دقيقة، وبتأخر أرقام اللوحة بضع دقائق — فاستغللت ذلك لتخفيف الحمل', { x: 0.6, y: 6.6, w: 12.13, h: 0.4, fontSize: 14, color: C.accent6, italic: true });
s.addNotes('صفحة التصفح أكثر صفحة زيارة. البحث بكلمة داخل الوصف يحتاج عادة قراءة الجدول كله، فأضفت امتداد pg_trgm وفهرس GIN. والملف الشخصي لا يحسب متوسط التقييم كل مرة: أخزن المجموع والعدد وأحدّثهما مع كل تقييم داخل نفس المعاملة. والكاش في Redis لأنه مشترك بين كل نسخ السيرفر.');

// ═════════════════════════ 17. Abuse limits ═════════════════════════
s = slide('CONTENT', 'خلف الكواليس');
title(s, 'الحماية من الإساءة');
[['5', 'محاولات دخول / دقيقة', C.accent3], ['3', 'حسابات جديدة / ساعة', C.accent2], ['20', 'عرضاً / يوم لكل مستقل', C.accent4], ['100', 'طلب / دقيقة عام', C.accent1]].forEach(([b, l, c], i) => {
  const x = 9.75 - i * 3.05;
  card(s, x, 1.4, 2.85, 1.95, C.background2, `limit-${i + 1}`);
  stat(s, x, 1.5, 2.85, b, l, c);
});
code(s, [
  '// auth.controller.ts',
  '@Public()',
  '@Throttle({ default: {',
  '  limit: () => limits().loginPerMinute,',
  '  ttl: 60_000 } })',
  "@Post('login')",
], 0.6, 3.65, 7.3, 2.15, 12, 'code-throttle');
card(s, 8.15, 3.65, 4.58, 3.15, C.background2, 'ownership');
text(s, 'الدور لا يكفي: الملكية', { x: 8.35, y: 3.75, w: 4.18, h: 0.45, fontSize: 18, bold: true });
text(s, 'سارة وعمر كلاهما صاحب مشروع، لكن لا يلمس أحدهما مشروع الآخر. كل خدمة تفحص المالك وإلا ترد 403:', { x: 8.35, y: 4.25, w: 4.18, h: 1.2, fontSize: 14, color: C.text2 });
code(s, ['project.clientId !== user.userId', '  -> ForbiddenException'], 8.35, 5.45, 4.18, 0.75, 11, 'code-owner');
text(s, 'هكذا لا يصل أحد لبيانات غيره بتغيير رقم في الرابط', { x: 8.35, y: 6.25, w: 4.18, h: 0.45, fontSize: 13, color: C.accent6 });
text(s, 'الدخول والتسجيل محدودان لكل عنوان IP، أما العروض فلكل حساب، فلا يُلتف عليها بتغيير الشبكة', { x: 0.6, y: 6.0, w: 7.3, h: 0.8, fontSize: 14, color: C.accent6 });
s.addNotes('كل الحدود من الوصف حرفياً. الدخول والتسجيل بـ Throttle لكل IP. أما العروض فالحد لكل مستقل، لذلك عددتها في قاعدة البيانات. وأهم نقطة أمنية: الصلاحية ليست الدور فقط، بل الملكية تُفحص في كل Service.');

// ═════════════════════════ 18. Proof ═════════════════════════
pres.addSection({ title: 'الإثبات' });
s = slide('CONTENT', 'الإثبات');
title(s, 'الإثبات: كل شيء مختبر على قاعدة بيانات حقيقية');
[['107', 'طلباً في Postman', C.accent4], ['152', 'فحصاً تلقائياً', C.accent1], ['36', 'اختبار e2e', C.accent2], ['0', 'فشل', C.accent6]].forEach(([b, l, c], i) => {
  const x = 9.75 - i * 3.05;
  card(s, x, 1.45, 2.85, 2.0, C.background2, `proof-${i + 1}`);
  stat(s, x, 1.6, 2.85, b, l, c);
});
code(s, [
  '$ npm run test:e2e',
  'Test Suites: 2 passed, 2 total',
  'Tests:       36 passed, 36 total',
  '',
  '$ newman run postman/FreelanceHub.postman_collection.json',
  'requests 107 | assertions 152 | failed 0',
], 0.6, 3.8, 7.3, 2.25, 13, 'code-proof');
card(s, 8.15, 3.8, 4.58, 2.25, C.background2, 'what-tested');
text(s, [
  { text: '✓ القصة كاملة بالأرقام', options: { breakLine: true } },
  { text: '✓ الضغط المزدوج والتزامن', options: { breakLine: true } },
  { text: '✓ كشف سرقة المفتاح والحظر الفوري', options: { breakLine: true } },
  { text: '✓ مهمة منتصف الليل والبريد', options: { breakLine: true } },
  { text: '✓ الحدود والملكية وشكل الأخطاء', options: {} },
], { x: 8.35, y: 3.95, w: 4.18, h: 2.0, fontSize: 15, color: C.text1, paraSpaceAfter: 3 });
s.addNotes('الآن أشغّل مجموعة Postman أمامكم بضغطة Run: 107 طلبات و152 فحصاً، كلها خضراء. وعندي 36 اختباراً آلياً يشغّل التطبيق الحقيقي على PostgreSQL وRedis حقيقيين ويمثل القصة كاملة بالأرقام، والتزامن بطلبات متوازية، وكشف السرقة. (هنا: افتح Postman واضغط Run، ثم افتح Swagger على localhost:3100/docs)');

// ═════════════════════════ 19. Close ═════════════════════════
s = slide('DARK', 'الإثبات');
s.addText('شكراً — أسئلتكم', { placeholder: 'title', ...AR });
s.addText('المشروع، التحليل، المخططات، الشرح، ومجموعة Postman: كلها في المستودع', { placeholder: 'body', ...AR });
[['docs/ANALYSIS.md', 'التحليل والقرارات'], ['docs/erd.png · use-case.png', 'المخططات'], ['postman/…collection.json', 'كل الـ endpoints']].forEach(([h, d], i) => {
  const x = 8.85 - i * 4.1;
  s.addText(h, { isTextBox: true, x, y: 5.2, w: 3.8, h: 0.45, fontFace: 'Courier New', fontSize: 14, bold: true, color: C.accent2, align: 'center', margin: 0 });
  s.addText(d, { isTextBox: true, x, y: 5.65, w: 3.8, h: 0.4, fontSize: 14, color: C.background1, align: 'center', margin: 0, rtlMode: true });
});
s.addNotes('الخلاصة: بنيت خادماً كاملاً يحمي المال بالمعاملات وقيود قاعدة البيانات، يصمد أمام التزامن، يرد فوراً ويرسل البريد بالخلفية، وموثق ومختبر. أي قرار لم يحدده الوصف كتبته في ANALYSIS.md مع السبب. شكراً، وأنا جاهز للأسئلة.');

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('written', OUT);
})();
