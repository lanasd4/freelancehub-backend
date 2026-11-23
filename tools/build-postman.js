// Generates postman/FreelanceHub.postman_collection.json
// usage: node build-postman.js <projectRoot>
const fs = require('fs');
const path = require('path');

const root = process.argv[2];
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env'), 'utf8')
    .split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
);
const samples = path.join(root, 'postman', 'samples').replace(/\\/g, '/');

let n = 0;
function r(name, method, url, o = {}) {
  const headers = [];
  if (o.as) headers.push({ key: 'Authorization', value: `Bearer {{${o.as}Token}}` });
  const tests = [];
  const expect = Array.isArray(o.expect) ? o.expect : [o.expect ?? 200];
  tests.push(
    `pm.test("HTTP ${expect.join(' or ')}", () => pm.expect(pm.response.code).to.be.oneOf([${expect.join(',')}]));`,
  );
  if (o.json === undefined && !o.form) {
    // nothing
  }
  tests.push('let body; try { body = pm.response.json(); } catch (e) { body = null; }');
  (o.tests || []).forEach((t) => tests.push(t));
  const request = {
    method,
    header: headers,
    url: {
      raw: `{{baseUrl}}${url}`,
      host: ['{{baseUrl}}'],
      path: url.split('?')[0].split('/').filter(Boolean),
      ...(url.includes('?') && {
        query: url.split('?')[1].split('&').map((kv) => {
          const [key, value] = kv.split('=');
          return { key, value };
        }),
      }),
    },
    description: o.desc,
  };
  if (o.json !== undefined) {
    headers.push({ key: 'Content-Type', value: 'application/json' });
    request.body = { mode: 'raw', raw: JSON.stringify(o.json, null, 2), options: { raw: { language: 'json' } } };
  }
  if (o.form) {
    request.body = {
      mode: 'formdata',
      formdata: o.form.map((f) =>
        f.file
          ? { key: f.key, type: 'file', src: `${samples}/${f.file}` }
          : { key: f.key, value: String(f.value), type: 'text' },
      ),
    };
  }
  const events = [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }];
  if (o.pre) events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: o.pre } });
  n++;
  return { name, event: events, request, response: [] };
}
const f = (name, description, item) => ({ name, description, item });
const save = (v, expr) => `pm.collectionVariables.set("${v}", ${expr});`;
const t = (label, cond) => `pm.test(${JSON.stringify(label)}, () => { ${cond} });`;

const login = (who, emailVar) =>
  r(`Login as ${who}`, 'POST', '/auth/login', {
    json: { email: `{{${emailVar}}}`, password: who === 'admin' ? '{{adminPassword}}' : '{{demoPassword}}' },
    tests: [
      save(`${who}Token`, 'body.accessToken'),
      save(`${who}Refresh`, 'body.refreshToken'),
      save(`${who}Id`, 'body.user.id'),
      t('returns access + refresh tokens, never the password', 'pm.expect(body.accessToken).to.be.a("string"); pm.expect(body.user).to.not.have.property("password");'),
    ],
  });

const collection = {
  info: {
    name: 'FreelanceHub API — full demo',
    description: [
      'كل الـ endpoints مرتبة كقصة المشروع (سارة تنشر مشروعاً، أحمد وليلى وخالد يقدمون، سارة تقبل أحمد، المراحل والدفع 90/10، التقييم، السحب، المدير).',
      '',
      '**التشغيل:** شغّل السيرفر (`npm run start:dev`) ثم اضغط على المجموعة ← **Run** ← Run collection. كل طلب يحفظ ما يحتاجه الذي بعده (التوكنات، أرقام المشروع/العقد/المرحلة) وفيه اختبارات ✅.',
      '',
      '**ملاحظات:** يستخدم الحسابات التجريبية من `npm run seed` (كلمة السر Passw0rd!). تسجيل الدخول محدود بـ 5 محاولات/دقيقة: انتظر دقيقة بين تشغيلين كاملين. التسجيل محدود بـ 3 حسابات/ساعة.',
      'ملفات الرفع في `postman/samples/` — إن نقلت المشروع لمكان آخر أعد اختيار الملفات في طلبات form-data.',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: `http://localhost:${env.PORT || 3100}/api` },
    { key: 'adminEmail', value: env.ADMIN_EMAIL || 'admin@freelancehub.local' },
    { key: 'adminPassword', value: env.ADMIN_PASSWORD || 'ChangeMe123!' },
    { key: 'demoPassword', value: 'Passw0rd!' },
    { key: 'saraEmail', value: 'sara@demo.local' },
    { key: 'ahmedEmail', value: 'ahmed@demo.local' },
    { key: 'laylaEmail', value: 'layla@demo.local' },
    { key: 'khaledEmail', value: 'khaled@demo.local' },
  ],
  item: [
    f('0. Health', 'هل السيرفر وقاعدة البيانات يعملان؟', [
      r('Health check', 'GET', '/health', { tests: [t('status ok', 'pm.expect(body.status).to.eql("ok");')] }),
    ]),

    f('1. Accounts & devices', 'التسجيل، الدخول، أجهزتي. كل دخول يحفظ توكن المستخدم في متغيرات المجموعة.', [
      login('admin', 'adminEmail'),
      login('sara', 'saraEmail'),
      login('ahmed', 'ahmedEmail'),
      login('layla', 'laylaEmail'),
      login('khaled', 'khaledEmail'),
      r('Register a new freelancer', 'POST', '/auth/register', {
        pre: ['pm.collectionVariables.set("run", Date.now());'],
        json: { name: 'Mona', email: 'mona.{{run}}@demo.local', password: 'Passw0rd!', role: 'FREELANCER' },
        expect: [201, 429],
        desc: 'محدود بـ 3 حسابات جديدة في الساعة من نفس الـ IP — بعدها 429.',
        tests: [t('user + tokens (or 429 after 3/hour)', 'if (pm.response.code === 201) { pm.expect(body.user.role).to.eql("FREELANCER"); pm.expect(body.user).to.not.have.property("password"); }')],
      }),
      r('Register as ADMIN is refused (400)', 'POST', '/auth/register', {
        json: { name: 'Hacker', email: 'hacker.{{run}}@demo.local', password: 'Passw0rd!', role: 'ADMIN' },
        expect: [400, 429],
        desc: 'حساب المدير لا يُنشأ من التسجيل أبداً.',
      }),
      r('Me (current user)', 'GET', '/users/me', {
        as: 'sara',
        tests: [t('Sara is a CLIENT', 'pm.expect(body.role).to.eql("CLIENT");')],
      }),
      r('My devices (sessions)', 'GET', '/auth/sessions', {
        as: 'sara',
        desc: 'كل الأجهزة المسجّل منها: نوع الجهاز، IP، وقت الدخول، والجهاز الحالي current=true.',
        tests: [
          t('one session is the current device', 'pm.expect(body.filter(s => s.current)).to.have.length(1); pm.expect(body[0]).to.have.keys("id","device","userAgent","ip","loggedInAt","lastUsedAt","current");'),
          save('otherSessionId', '(body.find(s => !s.current) || {}).id || "00000000-0000-0000-0000-000000000000"'),
        ],
      }),
      r('Log out ONE other device', 'DELETE', '/auth/sessions/{{otherSessionId}}', {
        as: 'sara',
        expect: [204, 404],
        desc: 'مثلاً جهاز المقهى. 404 إن لم يكن لديها جهاز آخر.',
      }),
    ]),

    f('2. Public browsing', 'بدون تسجيل دخول.', [
      r('Categories (cached)', 'GET', '/categories', {
        tests: [t('has categories', 'pm.expect(body.length).to.be.above(0);'), save('categoryId', '(body.find(c => c.name === "برمجة وتطوير") || body[0]).id')],
      }),
      r('Skills (cached)', 'GET', '/skills', {
        tests: [save('skillIds', 'JSON.stringify(body.slice(0, 3).map(s => s.id))')],
      }),
      r('Browse projects: filter + sort + paginate', 'GET', '/projects?status=OPEN&categoryId={{categoryId}}&budgetMin=300&budgetMax=800&sortBy=budget&order=desc&page=1&limit=5', {
        desc: 'تصفية بالتصنيف ومجال الميزانية والحالة، ترتيب بالميزانية، صفحة صفحة مع العدد الكلي.',
        tests: [t('paginated shape', 'pm.expect(body).to.have.keys("data","meta"); pm.expect(body.meta).to.have.keys("total","page","limit","totalPages");')],
      }),
      r('Search inside title or description', 'GET', '/projects?search=تطبيق', {
        tests: [t('found something', 'pm.expect(body.meta.total).to.be.at.least(1);')],
      }),
      r('Freelancer public profile (Layla)', 'GET', '/freelancers/{{laylaId}}', {
        desc: 'المتوسط وعدد المشاريع وآخر التقييمات — محسوبة مسبقاً ومخزّنة في الكاش.',
        tests: [t('rating + completed + latest reviews', 'pm.expect(body.rating).to.have.keys("average","count"); pm.expect(body).to.have.property("completedProjects"); pm.expect(body.latestReviews).to.be.an("array"); pm.expect(JSON.stringify(body)).to.not.include("@demo.local");')],
      }),
      r('Reviews a user received', 'GET', '/users/{{laylaId}}/reviews'),
      r('Unknown project → 404 (error shape)', 'GET', '/projects/999999999', {
        expect: 404,
        desc: 'كل الأخطاء بنفس الشكل: statusCode, error, message, path, timestamp.',
        tests: [t('uniform error shape', 'pm.expect(body).to.have.keys("statusCode","error","message","path","timestamp");')],
      }),
    ]),

    f('3. Freelancer profile', 'أحمد يكمل ملفه: المسمى، النبذة، السعر، المهارات، الصورة، السيرة.', [
      r('Update profile + skills', 'PATCH', '/freelancers/me/profile', {
        as: 'ahmed',
        json: { title: 'مطوّر تطبيقات Flutter', bio: 'أبني تطبيقات متاجر منذ 5 سنوات', hourlyRate: 20, skillIds: '__SKILLS__' },
        tests: [t('skills saved', 'pm.expect(body.skills.length).to.be.above(0);')],
      }),
      r('Upload avatar (image ≤ 2MB)', 'PUT', '/freelancers/me/avatar', {
        as: 'ahmed', form: [{ key: 'file', file: 'avatar.png' }],
        tests: [t('public URL', 'pm.expect(body.avatarUrl).to.match(/^\\/uploads\\/avatars\\//);')],
      }),
      r('Upload CV (PDF ≤ 5MB)', 'PUT', '/freelancers/me/cv', {
        as: 'ahmed', form: [{ key: 'file', file: 'cv.pdf' }],
        tests: [t('public URL', 'pm.expect(body.cvUrl).to.match(/^\\/uploads\\/cvs\\/.*\\.pdf$/);')],
      }),
      r('CV must be a PDF → 400', 'PUT', '/freelancers/me/cv', {
        as: 'ahmed', form: [{ key: 'file', file: 'avatar.png' }], expect: 400,
      }),
      r('A client cannot edit a freelancer profile → 403', 'PATCH', '/freelancers/me/profile', {
        as: 'sara', json: { bio: 'x' }, expect: 403,
      }),
    ]),

    f('4. Sara publishes a project', 'اليوم الأول من القصة.', [
      r('Top up wallet ($600)', 'POST', '/wallet/deposit', {
        as: 'sara', json: { amount: 600 },
        desc: 'بدون بوابة دفع في هذه النسخة: المبلغ يُضاف مباشرة ويُسجَّل كحركة DEPOSIT.',
      }),
      r('Wallet before accepting', 'GET', '/wallet', {
        as: 'sara',
        tests: [save('saraHeldBefore', 'Number(body.heldBalance)'), save('saraBalanceBefore', 'Number(body.balance)'), t('balance ≥ 600', 'pm.expect(Number(body.balance)).to.be.at.least(600);')],
      }),
      r('Publish project (multipart + attachment)', 'POST', '/projects', {
        as: 'sara',
        pre: ['pm.collectionVariables.set("deadline", new Date(Date.now() + 7 * 864e5).toISOString());'],
        form: [
          { key: 'title', value: 'تطبيق موبايل لمتجر ملابس' },
          { key: 'description', value: 'تطبيق يعرض المنتجات ويستقبل الطلبات مع لوحة لإدارة المخزون' },
          { key: 'categoryId', value: '{{categoryId}}' },
          { key: 'budgetMin', value: 400 },
          { key: 'budgetMax', value: 600 },
          { key: 'deadline', value: '{{deadline}}' },
          { key: 'attachments', file: 'design-sample.png' },
        ],
        expect: 201,
        tests: [save('projectId', 'body.id'), t('OPEN with 1 attachment', 'pm.expect(body.status).to.eql("OPEN"); pm.expect(body.attachments).to.have.length(1);')],
      }),
      r('Validation: budgetMin > budgetMax → 400', 'POST', '/projects', {
        as: 'sara',
        form: [
          { key: 'title', value: 'x' }, { key: 'description', value: 'x' }, { key: 'categoryId', value: '{{categoryId}}' },
          { key: 'budgetMin', value: 600 }, { key: 'budgetMax', value: 400 }, { key: 'deadline', value: '{{deadline}}' },
        ],
        expect: 400,
      }),
      r('A freelancer cannot publish → 403', 'POST', '/projects', {
        as: 'ahmed',
        form: [{ key: 'title', value: 'x' }, { key: 'description', value: 'x' }, { key: 'categoryId', value: '{{categoryId}}' }, { key: 'budgetMin', value: 1 }, { key: 'budgetMax', value: 2 }, { key: 'deadline', value: '{{deadline}}' }],
        expect: 403,
      }),
      r('Project details (public)', 'GET', '/projects/{{projectId}}'),
    ]),

    f('5. Proposals', 'أحمد وليلى وخالد يقدّمون عروضهم.', [
      r('Ahmed bids $500 / 20 days', 'POST', '/projects/{{projectId}}/proposals', {
        as: 'ahmed', json: { price: 500, durationDays: 20, message: 'نفذت 6 تطبيقات متاجر بـ Flutter وأستطيع البدء فوراً' }, expect: 201,
        tests: [save('proposalAhmed', 'body.id')],
      }),
      r('Ahmed bids again → 409 (one per project)', 'POST', '/projects/{{projectId}}/proposals', {
        as: 'ahmed', json: { price: 450, durationDays: 20, message: 'محاولة عرض ثانٍ على نفس المشروع' }, expect: 409,
        desc: 'قيد UNIQUE في قاعدة البيانات — يصمد حتى مع الضغط المزدوج.',
      }),
      r('Layla bids $450 / 25 days', 'POST', '/projects/{{projectId}}/proposals', {
        as: 'layla', json: { price: 450, durationDays: 25, message: 'سأبدأ بتصميم تجربة المستخدم ثم البرمجة' }, expect: 201,
        tests: [save('proposalLayla', 'body.id')],
      }),
      r('Khaled bids $550 / 15 days', 'POST', '/projects/{{projectId}}/proposals', {
        as: 'khaled', json: { price: 550, durationDays: 15, message: 'أبني الـ API ولوحة الإدارة بسرعة' }, expect: 201,
        tests: [save('proposalKhaled', 'body.id')],
      }),
      r('The owner cannot bid on her project → 403', 'POST', '/projects/{{projectId}}/proposals', {
        as: 'sara', json: { price: 1, durationDays: 1, message: 'عرض على مشروعي أنا' }, expect: 403,
      }),
      r('Layla edits her pending proposal', 'PATCH', '/proposals/{{proposalLayla}}', {
        as: 'layla', json: { price: 440 },
        tests: [t('price updated', 'pm.expect(Number(body.price)).to.eql(440);')],
      }),
      r('Khaled cannot edit Layla’s proposal → 403', 'PATCH', '/proposals/{{proposalLayla}}', {
        as: 'khaled', json: { price: 1 }, expect: 403,
      }),
      r('Sara: unread notifications count', 'GET', '/notifications/unread-count', {
        as: 'sara', tests: [t('notified for every proposal', 'pm.expect(body.count).to.be.at.least(3);')],
      }),
      r('Sara compares proposals (by price, with ratings)', 'GET', '/projects/{{projectId}}/proposals?sortBy=price&order=asc', {
        as: 'sara',
        tests: [t('3 proposals, cheapest first, rating shown', 'pm.expect(body.meta.total).to.eql(3); pm.expect(Number(body.data[0].price)).to.be.at.most(Number(body.data[1].price)); pm.expect(body.data[0].freelancer.rating).to.have.keys("average","count");')],
      }),
      r('Only the owner sees them → 403', 'GET', '/projects/{{projectId}}/proposals', { as: 'ahmed', expect: 403 }),
      r('Ahmed: my proposals', 'GET', '/proposals/mine?status=PENDING', { as: 'ahmed' }),
    ]),

    f('6. Accept → escrow + contract', 'أهم لحظة: حجز المال + إنشاء العقد + رفض الباقي، كلها معاملة واحدة. البريد يُرسل بالخلفية.', [
      r('Sara accepts Ahmed', 'POST', '/proposals/{{proposalAhmed}}/accept', {
        as: 'sara',
        tests: [save('contractId', 'body.contractId'), t('contract + IN_PROGRESS', 'pm.expect(body.projectStatus).to.eql("IN_PROGRESS"); pm.expect(Number(body.amount)).to.eql(500);'), t('answers fast (emails are in the background)', 'pm.expect(pm.response.responseTime).to.be.below(3000);')],
      }),
      r('Accept a second proposal → 409', 'POST', '/proposals/{{proposalLayla}}/accept', {
        as: 'sara', expect: 409, desc: 'لا يمكن قبول عرضين على نفس المشروع.',
      }),
      r('Sara’s wallet: $500 moved to held', 'GET', '/wallet', {
        as: 'sara',
        tests: [t('held +500, available −500', 'pm.expect(Number(body.heldBalance) - pm.collectionVariables.get("saraHeldBefore")).to.be.closeTo(500, 0.001); pm.expect(pm.collectionVariables.get("saraBalanceBefore") - Number(body.balance)).to.be.closeTo(500, 0.001);')],
      }),
      r('Layla: her proposal is REJECTED', 'GET', '/proposals/mine', {
        as: 'layla',
        tests: [t('rejected', 'const p = body.data.find(x => x.id == pm.collectionVariables.get("proposalLayla")); pm.expect(p.status).to.eql("REJECTED");')],
      }),
      r('The project can no longer be edited → 409', 'PATCH', '/projects/{{projectId}}', {
        as: 'sara', json: { title: 'تعديل بعد بدء التنفيذ' }, expect: 409,
      }),
      r('Ahmed: notifications (accepted)', 'GET', '/notifications?unreadOnly=true', {
        as: 'ahmed', tests: [t('PROPOSAL_ACCEPTED', 'pm.expect(body.data.map(x => x.type)).to.include("PROPOSAL_ACCEPTED");')],
      }),
    ]),

    f('7. Milestones, delivery, payment', 'اليوم 4–20: المراحل 100 + 250 + 150، التسليم، طلب التعديل، الموافقة والدفع 90/10.', [
      r('Wallets before payments (Ahmed)', 'GET', '/wallet', { as: 'ahmed', tests: [save('ahmedBefore', 'Number(body.balance)')] }),
      ...[['1', 'تصميم الواجهات', 100], ['2', 'برمجة الواجهات وربطها', 250], ['3', 'الاختبار والنشر على المتجر', 150]].map(([i, title, amount]) =>
        r(`Add milestone ${i}: ${title} ($${amount})`, 'POST', '/contracts/{{contractId}}/milestones', {
          as: 'sara', json: { title, amount }, expect: 201, tests: [save(`m${i}`, 'body.id')],
        }),
      ),
      r('Exceeding the contract amount → 400', 'POST', '/contracts/{{contractId}}/milestones', {
        as: 'sara', json: { title: 'مرحلة إضافية', amount: 1 }, expect: 400,
      }),
      r('Contract details (milestones)', 'GET', '/contracts/{{contractId}}', {
        as: 'ahmed', tests: [t('3 milestones, nothing unallocated', 'pm.expect(body.milestones).to.have.length(3); pm.expect(Number(body.unallocated)).to.eql(0);')],
      }),
      r('Ahmed delivers milestone 1 (ZIP + note)', 'POST', '/milestones/{{m1}}/submissions', {
        as: 'ahmed', form: [{ key: 'note', value: 'التصاميم — النسخة الأولى' }, { key: 'files', file: 'delivery.zip' }], expect: 201,
      }),
      r('Sara asks for a revision', 'POST', '/milestones/{{m1}}/request-revision', {
        as: 'sara', json: { note: 'أرجو تغيير الألوان' },
        tests: [t('REVISION_REQUESTED', 'pm.expect(body.status).to.eql("REVISION_REQUESTED");')],
      }),
      r('Ahmed re-delivers milestone 1', 'POST', '/milestones/{{m1}}/submissions', {
        as: 'ahmed', form: [{ key: 'note', value: 'النسخة الثانية بالألوان الجديدة' }, { key: 'files', file: 'delivery.zip' }, { key: 'files', file: 'cv.pdf' }], expect: 201,
      }),
      r('Submissions history', 'GET', '/milestones/{{m1}}/submissions', {
        as: 'sara', tests: [t('2 deliveries kept', 'pm.expect(body.length).to.eql(2);'), save('fileId', 'body[0].files[0].id')],
      }),
      r('Download a delivery file (party)', 'GET', '/submission-files/{{fileId}}/download', {
        as: 'sara', tests: [t('downloaded as attachment', 'pm.expect(pm.response.headers.get("Content-Disposition")).to.include("attachment");')],
      }),
      r('A stranger cannot download it → 403', 'GET', '/submission-files/{{fileId}}/download', { as: 'layla', expect: 403 }),
      r('Approve milestone 1 → Ahmed +$90, platform +$10', 'POST', '/milestones/{{m1}}/approve', {
        as: 'sara', tests: [t('90 / 10', 'pm.expect(Number(body.payout)).to.eql(90); pm.expect(Number(body.commission)).to.eql(10); pm.expect(body.contractStatus).to.eql("ACTIVE");')],
      }),
      r('Approve again (double click) → 409, paid once', 'POST', '/milestones/{{m1}}/approve', { as: 'sara', expect: 409 }),
      r('Ahmed delivers milestone 2', 'POST', '/milestones/{{m2}}/submissions', { as: 'ahmed', form: [{ key: 'note', value: 'المرحلة الثانية' }, { key: 'files', file: 'delivery.zip' }], expect: 201 }),
      r('Approve milestone 2', 'POST', '/milestones/{{m2}}/approve', { as: 'sara', tests: [t('225 / 25', 'pm.expect(Number(body.payout)).to.eql(225);')] }),
      r('Ahmed delivers milestone 3', 'POST', '/milestones/{{m3}}/submissions', { as: 'ahmed', form: [{ key: 'note', value: 'المرحلة الأخيرة' }, { key: 'files', file: 'delivery.zip' }], expect: 201 }),
      r('Approve milestone 3 → contract COMPLETED', 'POST', '/milestones/{{m3}}/approve', {
        as: 'sara', tests: [t('completed', 'pm.expect(body.contractStatus).to.eql("COMPLETED");')],
      }),
      r('Ahmed’s wallet: +$450', 'GET', '/wallet', {
        as: 'ahmed', tests: [t('+450', 'pm.expect(Number(body.balance) - pm.collectionVariables.get("ahmedBefore")).to.be.closeTo(450, 0.001);'), save('ahmedBalance', 'Number(body.balance)')],
      }),
      r('Ahmed’s history: payments only', 'GET', '/wallet/transactions?type=PAYMENT&limit=3', {
        as: 'ahmed', tests: [t('135, 225, 90', 'pm.expect(body.data.map(x => Number(x.amount))).to.eql([135, 225, 90]);')],
      }),
      r('Project is COMPLETED', 'GET', '/projects/{{projectId}}', { tests: [t('COMPLETED', 'pm.expect(body.status).to.eql("COMPLETED");')] }),
    ]),

    f('8. Reviews', 'بعد اكتمال العقد يقيّم كل طرف الآخر مرة واحدة.', [
      r('Sara rates Ahmed 5★', 'POST', '/contracts/{{contractId}}/reviews', { as: 'sara', json: { rating: 5, comment: 'عمل ممتاز والتزام بالمواعيد' }, expect: 201 }),
      r('Sara rates again → 409', 'POST', '/contracts/{{contractId}}/reviews', { as: 'sara', json: { rating: 5, comment: 'مرة ثانية' }, expect: 409 }),
      r('Ahmed rates Sara 5★', 'POST', '/contracts/{{contractId}}/reviews', { as: 'ahmed', json: { rating: 5, comment: 'عميلة واضحة في طلباتها' }, expect: 201 }),
      r('A stranger cannot review → 403', 'POST', '/contracts/{{contractId}}/reviews', { as: 'layla', json: { rating: 1, comment: 'x' }, expect: 403 }),
      r('Ahmed’s profile now shows the rating', 'GET', '/freelancers/{{ahmedId}}', {
        tests: [t('rated + completed', 'pm.expect(body.rating.count).to.be.at.least(1); pm.expect(body.completedProjects).to.be.at.least(1); pm.expect(body.latestReviews.length).to.be.at.least(1);')],
      }),
    ]),

    f('9. Withdraw', 'السحب من الرصيد المتاح فقط، ولا يصبح سالباً أبداً.', [
      r('Ahmed withdraws everything', 'POST', '/wallet/withdraw', {
        as: 'ahmed', json: { amount: '__AHMED_BALANCE__' },
        tests: [t('balance 0', 'pm.expect(Number(body.balance)).to.eql(0);')],
      }),
      r('Withdraw more than available → 402', 'POST', '/wallet/withdraw', { as: 'ahmed', json: { amount: 1 }, expect: 402 }),
      r('History filtered by type and dates', 'GET', '/wallet/transactions?type=WITHDRAWAL&from=2026-01-01&to=2030-12-31', { as: 'ahmed' }),
    ]),

    f('10. Notifications', 'قائمة، تعليم كمقروء، العدد.', [
      r('List', 'GET', '/notifications?page=1&limit=5', { as: 'ahmed', tests: [save('notificationId', 'body.data[0].id')] }),
      r('Mark one as read', 'PATCH', '/notifications/{{notificationId}}/read', { as: 'ahmed' }),
      r('Someone else’s notification → 404', 'PATCH', '/notifications/{{notificationId}}/read', { as: 'sara', expect: 404 }),
      r('Mark all as read', 'PATCH', '/notifications/read-all', { as: 'ahmed' }),
      r('Unread count = 0', 'GET', '/notifications/unread-count', { as: 'ahmed', tests: [t('zero', 'pm.expect(body.count).to.eql(0);')] }),
    ]),

    f('11. Project lifecycle: cancel & soft delete', 'الإلغاء والحذف الناعم (يختفي من المنصة ويبقى في قاعدة البيانات).', [
      r('Publish another project', 'POST', '/projects', {
        as: 'sara',
        form: [{ key: 'title', value: 'مشروع للحذف' }, { key: 'description', value: 'تجربة الحذف الناعم' }, { key: 'categoryId', value: '{{categoryId}}' }, { key: 'budgetMin', value: 50 }, { key: 'budgetMax', value: 100 }, { key: 'deadline', value: '{{deadline}}' }],
        expect: 201, tests: [save('project2', 'body.id')],
      }),
      r('Khaled bids on it', 'POST', '/projects/{{project2}}/proposals', { as: 'khaled', json: { price: 80, durationDays: 3, message: 'أستطيع إنجازه خلال 3 أيام' }, expect: 201 }),
      r('Someone else cannot delete it → 403', 'DELETE', '/projects/{{project2}}', { as: 'ahmed', expect: 403 }),
      r('Sara deletes it (soft delete)', 'DELETE', '/projects/{{project2}}', { as: 'sara', expect: 204 }),
      r('Gone from the platform → 404', 'GET', '/projects/{{project2}}', { expect: 404 }),
      r('Khaled’s proposal became REJECTED', 'GET', '/proposals/mine?status=REJECTED', {
        as: 'khaled', tests: [t('rejected', 'pm.expect(body.data.map(x => x.projectId)).to.include(Number(pm.collectionVariables.get("project2")));')],
      }),
      r('My projects (Sara)', 'GET', '/projects/mine', { as: 'sara' }),
      r('My contracts (Ahmed)', 'GET', '/contracts?status=COMPLETED', { as: 'ahmed' }),
    ]),

    f('12. Admin', 'لوحة الأرقام، التصنيفات والمهارات، البحث والحظر، مهمة منتصف الليل.', [
      r('Dashboard', 'GET', '/admin/dashboard', {
        as: 'admin',
        desc: 'مخزّنة 5 دقائق (generatedAt يبين عمرها).',
        tests: [t('all sections', 'pm.expect(body).to.have.keys("generatedAt","users","projects","earnings","topFreelancers","topCategories"); pm.expect(body.earnings.lastSixMonths).to.have.length(6);')],
      }),
      r('Only admins → 403', 'GET', '/admin/dashboard', { as: 'sara', expect: 403 }),
      r('Create category', 'POST', '/categories', {
        as: 'admin', json: { name: 'تصنيف تجريبي {{run}}' }, expect: 201, tests: [save('newCategoryId', 'body.id')],
      }),
      r('Rename category (everyone sees it at once)', 'PATCH', '/categories/{{newCategoryId}}', { as: 'admin', json: { name: 'تصنيف معدّل {{run}}' } }),
      r('Delete category', 'DELETE', '/categories/{{newCategoryId}}', { as: 'admin', expect: 204 }),
      r('Category with projects cannot be deleted → 409', 'DELETE', '/categories/{{categoryId}}', { as: 'admin', expect: 409 }),
      r('Create skill', 'POST', '/skills', { as: 'admin', json: { name: 'مهارة {{run}}' }, expect: 201, tests: [save('newSkillId', 'body.id')] }),
      r('Delete skill', 'DELETE', '/skills/{{newSkillId}}', { as: 'admin', expect: 204 }),
      r('Search users', 'GET', '/admin/users?search=layla&role=FREELANCER', { as: 'admin' }),
      r('Ban Layla', 'POST', '/admin/users/{{laylaId}}/ban', { as: 'admin', expect: 201, tests: [t('banned', 'pm.expect(body.isBanned).to.eql(true);')] }),
      r('Layla is stopped IMMEDIATELY → 401', 'GET', '/users/me', { as: 'layla', expect: 401, desc: 'حتى لو كان توكنها ما زال صالحاً.' }),
      r('Unban Layla', 'POST', '/admin/users/{{laylaId}}/unban', { as: 'admin', expect: 201 }),
      r('Run the midnight job now', 'POST', '/admin/jobs/expire-projects', {
        as: 'admin', expect: 202, desc: 'تعمل تلقائياً كل يوم 00:00. هنا نشغّلها يدوياً: تلغي المشاريع المفتوحة المنتهي موعدها وتبلّغ أصحاب العلاقة.',
      }),
    ]),

    f('13. Security demos (run last)', 'أمثلة الحماية. تُنهي جلسات خالد، لذلك في الآخر.', [
      r('Refresh tokens (rotation)', 'POST', '/auth/refresh', {
        json: { refreshToken: '{{khaledRefresh}}' },
        tests: [save('khaledOldRefresh', 'pm.collectionVariables.get("khaledRefresh")'), save('khaledRefresh', 'body.refreshToken'), t('new pair', 'pm.expect(body.refreshToken).to.not.eql(pm.collectionVariables.get("khaledOldRefresh"));')],
      }),
      r('Reuse the OLD refresh token → all sessions ended', 'POST', '/auth/refresh', {
        json: { refreshToken: '{{khaledOldRefresh}}' }, expect: 401,
        desc: 'مفتاح قديم استُعمل مرة ثانية = غالباً مسروق، فتُنهى كل جلسات المستخدم على كل الأجهزة.',
        tests: [t('reuse detected', 'pm.expect(body.message).to.match(/reuse detected/);')],
      }),
      r('Even the newest token is dead now → 401', 'POST', '/auth/refresh', { json: { refreshToken: '{{khaledRefresh}}' }, expect: 401 }),
      r('Wrong password (5 tries/minute, then 429)', 'POST', '/auth/login', {
        json: { email: '{{khaledEmail}}', password: 'wrong-password' }, expect: [401, 429],
        desc: 'بعد 5 محاولات في الدقيقة من نفس الـ IP يأتي 429.',
      }),
      r('Logout (current device)', 'POST', '/auth/logout', { as: 'sara', expect: 204 }),
      r('Logged-out token is refused → 401', 'GET', '/users/me', { as: 'sara', expect: 401 }),
    ]),
  ],
};

// placeholders that must be raw JSON values, not strings
let json = JSON.stringify(collection, null, 2)
  .replace('\\"skillIds\\": \\"__SKILLS__\\"', '\\"skillIds\\": {{skillIds}}')
  .replace('\\"amount\\": \\"__AHMED_BALANCE__\\"', '\\"amount\\": {{ahmedBalance}}');
const out = path.join(root, 'postman', 'FreelanceHub.postman_collection.json');
fs.writeFileSync(out, json);
console.log(`${out}: ${n} requests`);
