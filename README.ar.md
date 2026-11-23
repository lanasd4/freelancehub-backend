# FreelanceHub — Back-End (v2)

[English](README.md) · **العربية**

منصة عمل حر عربية تجمع أصحاب المشاريع بالمستقلين، مع **محفظة وضمان مالي (Escrow)** و**عقود تُدفع على مراحل**.
مبنية حسب وصف المشروع `FreelanceHub (2).pdf` وبأسلوب «دليل الباك إند الشامل»:
**NestJS 11 · TypeScript · PostgreSQL 16 · Prisma 6 · Redis · BullMQ · JWT**.

| ملف | محتواه |
|---|---|
| [`postman/FreelanceHub.postman_collection.json`](postman/FreelanceHub.postman_collection.json) | **مجموعة Postman**: 107 طلبات بأمثلة وردود حقيقية و152 فحصاً — Import ثم Run |
| [`assets/erd.png`](assets/erd.png) | مخطط قاعدة البيانات (ERD) |

---

## التشغيل السريع (Windows)

المتطلبات: **Node.js 22**، **PostgreSQL 16** (منفذ 5432)، **Redis 7** (هنا عبر Docker على المنفذ 6380).

```bash
npm install
```

```bash
docker run -d --name freelancehub-redis -p 6380:6379 --restart unless-stopped redis:7-alpine
```

```bash
npx prisma migrate deploy
```

```bash
npm run seed
```

```bash
npm run start:dev
```

- الـ API: `http://localhost:3100/api`
- **Swagger** (جرّب كل شيء من المتصفح): `http://localhost:3100/docs`
- فحص الصحة: `GET /api/health`

حسابات تجريبية (كلمة السر لكلها `Passw0rd!`):

| الحساب | الدور | الحالة |
|---|---|---|
| `sara@demo.local` | صاحبة مشروع | رصيدها 600$، لها مشروع عليه 3 عروض جاهزة للقبول |
| `omar@demo.local` | صاحب مشروع | 5 مشاريع مفتوحة، عقد مكتمل سابق |
| `ahmed@demo.local` | مستقل | Flutter |
| `layla@demo.local` | مستقلة | تقييم 5★، مشروع منجز، أرباح 180$ |
| `khaled@demo.local` | مستقل | Back-End |
| `admin@freelancehub.local` | مدير | كلمة السر من `ADMIN_PASSWORD` في `.env` |

## الاختبارات

```bash
npm test
```

```bash
npm run test:e2e
```

- `npm test`: اختبارات الوحدة (حساب 90/10 حتى آخر سنت، متوسط التقييم).
- `npm run test:e2e`: **36 اختباراً** على PostgreSQL وRedis حقيقيين، على قاعدة منفصلة (`TEST_DATABASE_URL`). تغطي قصة سارة وأحمد كاملة بالأرقام، والتزامن (ضغطتان معاً)، والجلسات، والحدود، ومهمة منتصف الليل، والبريد في الطابور.

## النشر بـ Docker

```bash
docker compose up -d --build
```

يشغّل `api` + `db` (PostgreSQL) + `redis` مع volumes، ويطبّق الـ migrations عند الإقلاع. ضع `DB_PASSWORD` وباقي الأسرار في `.env`.

---

## الـ Endpoints

🔓 = عام. الباقي يحتاج `Authorization: Bearer <accessToken>`. كل المسارات تبدأ بـ `/api`.

### الحسابات والأجهزة
| | Endpoint | من | ملاحظات |
|---|---|---|---|
| 🔓 | `POST /auth/register` | – | `role`: `CLIENT` أو `FREELANCER` — **3 حسابات/ساعة/IP** |
| 🔓 | `POST /auth/login` | – | **5 محاولات/دقيقة** |
| 🔓 | `POST /auth/refresh` | – | تدوير؛ إعادة استخدام مفتاح قديم ← **إنهاء كل الجلسات** |
| | `GET /auth/sessions` | أي | أجهزتي: الجهاز، IP، وقت الدخول، `current` |
| | `DELETE /auth/sessions/:id` | أي | الخروج من جهاز معيّن |
| | `POST /auth/logout`, `POST /auth/logout-all` | أي | |
| | `GET /users/me` | أي | |

### الملف الشخصي والمهارات والتصنيفات
| | Endpoint | من | |
|---|---|---|---|
| 🔓 | `GET /freelancers/:id` | – | تقييم، مشاريع منجزة، آخر التقييمات، مهارات (مخزّن مؤقتاً) |
| | `GET/PATCH /freelancers/me/profile` | FREELANCER | `title, bio, hourlyRate, skillIds[]` |
| | `PUT /freelancers/me/avatar` | FREELANCER | `file`: jpg/png/webp ≤ 2MB |
| | `PUT /freelancers/me/cv` | FREELANCER | `file`: PDF ≤ 5MB |
| 🔓 | `GET /skills`, `GET /categories` | – | مخزّنة مؤقتاً، تُبطَل عند التعديل |
| | `POST/PATCH/DELETE /skills`, `/categories` | ADMIN | لا يُحذف تصنيف عليه مشاريع |
| 🔓 | `GET /users/:id/reviews` | – | |

### المشاريع والعروض
| | Endpoint | من | |
|---|---|---|---|
| 🔓 | `GET /projects` | – | `page, limit, categoryId, status, budgetMin, budgetMax, search, sortBy=createdAt\|budget, order` |
| 🔓 | `GET /projects/:id` | – | |
| | `GET /projects/mine` | CLIENT/FREELANCER | |
| | `POST /projects` | CLIENT | multipart: `title, description, categoryId, budgetMin, budgetMax, deadline` + حتى 5 `attachments` |
| | `PATCH /projects/:id` | المالك | وهو `OPEN` فقط (يمكن إضافة مرفقات) |
| | `DELETE /projects/:id/attachments/:attId` | المالك | |
| | `POST /projects/:id/cancel` | المالك | وهو `OPEN` فقط |
| | `DELETE /projects/:id` | المالك | **حذف ناعم** |
| | `POST /projects/:id/proposals` | FREELANCER | `price, durationDays, message` — **20/يوم** |
| | `GET /projects/:id/proposals` | المالك | `sortBy=price\|createdAt, order, status` |
| | `GET /proposals/mine` | FREELANCER | `status=PENDING\|ACCEPTED\|REJECTED\|WITHDRAWN` |
| | `PATCH /proposals/:id`, `POST /proposals/:id/withdraw` | صاحبه | وهو `PENDING` |
| | `POST /proposals/:id/accept` | مالك المشروع | حجز + عقد + رفض الباقي (معاملة واحدة) |

### العقود والمراحل
| | Endpoint | من | |
|---|---|---|---|
| | `GET /contracts`, `GET /contracts/:id` | الطرفان (+المدير) | |
| | `POST /contracts/:id/milestones` | العميل | `title, amount` — المجموع ≤ قيمة العقد |
| | `PATCH/DELETE /milestones/:id` | العميل | ما دامت لم تُسلَّم |
| | `POST /milestones/:id/submissions` | المستقل | multipart: `note` + حتى 5 `files` (PDF/ZIP ≤ 10MB) |
| | `GET /milestones/:id/submissions` | الطرفان + المدير | تاريخ التسليمات |
| | `GET /submission-files/:id/download` | الطرفان + المدير | ملفات خاصة |
| | `POST /milestones/:id/approve` | العميل | 90% مستقل / 10% منصة؛ آخر مرحلة تُكمل العقد وتعيد المتبقي |
| | `POST /milestones/:id/request-revision` | العميل | `note` |
| | `POST /contracts/:id/reviews` | الطرفان | بعد الاكتمال، مرة واحدة: `rating 1..5, comment` |

### المحفظة والإشعارات والمدير
| | Endpoint | من | |
|---|---|---|---|
| | `GET /wallet` | أي | `balance` (متاح) و`heldBalance` (محجوز) |
| | `POST /wallet/deposit` | CLIENT | `{ amount }` |
| | `POST /wallet/withdraw` | FREELANCER/CLIENT | من المتاح فقط |
| | `GET /wallet/transactions` | أي | `type, from, to, page, limit` |
| | `GET /notifications` | أي | `unreadOnly=true` |
| | `GET /notifications/unread-count` | أي | |
| | `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` | أي | |
| | `GET /admin/dashboard` | ADMIN | مخزّن 5 دقائق |
| | `GET /admin/users` | ADMIN | `search, role, banned` |
| | `POST /admin/users/:id/ban`, `/unban` | ADMIN | فوري |
| | `POST /admin/jobs/expire-projects` | ADMIN | تشغيل مهمة منتصف الليل الآن |

### شكل الردود
- القوائم: `{ "data": [...], "meta": { "total", "page", "limit", "totalPages" } }` (`limit` ≤ 100).
- الأخطاء: `{ "statusCode", "error", "message", "path", "timestamp" }` — `message` نص، أو مصفوفة لأخطاء التحقق.
- المبالغ نصوص عشرية دقيقة (`"500"`, `"108.45"`).
