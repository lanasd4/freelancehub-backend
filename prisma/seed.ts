/**
 * Demo data so the platform can be tried right away (brief §16).
 *
 *   npm run seed          -> adds the demo data (safe to run twice: it skips if present)
 *   npm run db:reset      -> wipes the database, re-applies migrations, then seeds
 *
 * Every demo account uses the password:  Passw0rd!
 * Money in the seed follows the same rules as the app (ledger rows + balances
 * always agree), so the dashboard and wallets show consistent numbers.
 */
import {
  ContractStatus,
  MilestoneStatus,
  NotificationType,
  Prisma,
  PrismaClient,
  ProjectStatus,
  ProposalStatus,
  Role,
  TransactionType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const prisma = new PrismaClient();
const PASSWORD = 'Passw0rd!';
const DAY = 24 * 60 * 60 * 1000;
const days = (n: number) => new Date(Date.now() + n * DAY);
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const CATEGORIES = [
  'برمجة وتطوير',
  'تصميم',
  'كتابة وترجمة',
  'تسويق إلكتروني',
  'فيديو وأنيميشن',
];
const SKILLS = [
  'Flutter',
  'React',
  'Node.js',
  'NestJS',
  'Laravel',
  'UI/UX',
  'Figma',
  'Photoshop',
  'Illustrator',
  'SEO',
  'كتابة المحتوى',
  'ترجمة عربي-إنجليزي',
  'مونتاج فيديو',
  'Motion Graphics',
];

async function ensureAdmin() {
  const email = (
    process.env.ADMIN_EMAIL ?? 'admin@freelancehub.local'
  ).toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    include: { wallet: true },
  });
  if (existing) {
    if (!existing.wallet)
      await prisma.wallet.create({ data: { userId: existing.id } });
    return prisma.wallet.findUniqueOrThrow({ where: { userId: existing.id } });
  }
  const admin = await prisma.user.create({
    data: {
      name: 'Platform Admin',
      email,
      password: await bcrypt.hash(
        process.env.ADMIN_PASSWORD ?? 'ChangeMe123!',
        10,
      ),
      role: Role.ADMIN,
      wallet: { create: {} },
    },
    include: { wallet: true },
  });
  return admin.wallet!;
}

async function user(
  name: string,
  email: string,
  role: Role,
  profile?: {
    title: string;
    bio: string;
    hourlyRate: number;
    skills: string[];
  },
) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const skills = profile
    ? await prisma.skill.findMany({ where: { name: { in: profile.skills } } })
    : [];
  return prisma.user.create({
    data: {
      name,
      email,
      password: hash,
      role,
      wallet: { create: {} },
      ...(profile && {
        profile: {
          create: {
            title: profile.title,
            bio: profile.bio,
            hourlyRate: profile.hourlyRate,
            skills: { create: skills.map((s) => ({ skillId: s.id })) },
          },
        },
      }),
    },
    include: { wallet: true },
  });
}

async function deposit(walletId: number, amount: number) {
  await prisma.wallet.update({
    where: { id: walletId },
    data: { balance: { increment: amount } },
  });
  await prisma.transaction.create({
    data: { walletId, type: TransactionType.DEPOSIT, amount },
  });
}

async function main() {
  for (const name of CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  for (const name of SKILLS) {
    await prisma.skill.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  const platform = await ensureAdmin();

  if (await prisma.user.findUnique({ where: { email: 'sara@demo.local' } })) {
    console.log(
      'Demo data already present — nothing to do (use `npm run db:reset` to start over).',
    );
    return;
  }

  const cat = Object.fromEntries(
    (await prisma.category.findMany()).map((c) => [c.name, c.id]),
  ) as Record<string, number>;

  // ── people ──
  const sara = await user('سارة', 'sara@demo.local', Role.CLIENT);
  const omar = await user('عمر', 'omar@demo.local', Role.CLIENT);
  const ahmed = await user('أحمد', 'ahmed@demo.local', Role.FREELANCER, {
    title: 'مطوّر تطبيقات Flutter',
    bio: 'أبني تطبيقات موبايل للمتاجر منذ 5 سنوات.',
    hourlyRate: 20,
    skills: ['Flutter', 'Node.js', 'UI/UX'],
  });
  const layla = await user('ليلى', 'layla@demo.local', Role.FREELANCER, {
    title: 'مصممة واجهات ومطوّرة React',
    bio: 'أصمم تجربة مستخدم بسيطة وأحوّلها إلى واجهات React.',
    hourlyRate: 25,
    skills: ['React', 'Figma', 'UI/UX'],
  });
  const khaled = await user('خالد', 'khaled@demo.local', Role.FREELANCER, {
    title: 'مطوّر Back-End',
    bio: 'NestJS و Laravel وقواعد البيانات.',
    hourlyRate: 18,
    skills: ['NestJS', 'Laravel', 'Node.js'],
  });

  await deposit(sara.wallet!.id, 600);
  await deposit(omar.wallet!.id, 1000);

  // ── Sara's project from the story: open, with three proposals waiting ──
  const storeApp = await prisma.project.create({
    data: {
      title: 'تطبيق موبايل لمتجر ملابس',
      description:
        'أريد تطبيقاً لمتجري يعرض المنتجات ويستقبل الطلبات، مع لوحة بسيطة لإدارة المخزون.',
      categoryId: cat['برمجة وتطوير'],
      budgetMin: 400,
      budgetMax: 600,
      deadline: days(7),
      clientId: sara.id,
    },
  });
  const bids: [typeof ahmed, number, number, string][] = [
    [ahmed, 500, 20, 'نفذت 6 تطبيقات متاجر بـ Flutter، أستطيع البدء فوراً.'],
    [layla, 450, 25, 'سأهتم بتجربة المستخدم والتصميم قبل البرمجة.'],
    [khaled, 550, 15, 'أبني لك الـ API ولوحة الإدارة بسرعة.'],
  ];
  for (const [f, price, durationDays, message] of bids) {
    await prisma.proposal.create({
      data: {
        projectId: storeApp.id,
        freelancerId: f.id,
        price,
        durationDays,
        message,
      },
    });
    await prisma.notification.create({
      data: {
        userId: sara.id,
        type: NotificationType.PROPOSAL_RECEIVED,
        title: 'عرض جديد على مشروعك',
        body: `وصل عرض جديد بقيمة ${price}$ على مشروع "${storeApp.title}".`,
        data: { projectId: storeApp.id },
      },
    });
  }

  // ── more open projects to browse/filter ──
  const open: [string, string, string, number, number, number][] = [
    [
      'تصميم شعار لمقهى',
      'شعار عصري بألوان دافئة مع دليل ألوان.',
      'تصميم',
      50,
      150,
      10,
    ],
    [
      'ترجمة موقع شركة إلى الإنجليزية',
      '20 صفحة تقريباً، محتوى تقني.',
      'كتابة وترجمة',
      200,
      400,
      14,
    ],
    [
      'حملة تسويق على إنستغرام',
      'خطة شهرية ومحتوى 12 منشوراً.',
      'تسويق إلكتروني',
      300,
      500,
      5,
    ],
    [
      'فيديو موشن جرافيك 60 ثانية',
      'فيديو تعريفي لتطبيق توصيل.',
      'فيديو وأنيميشن',
      250,
      450,
      9,
    ],
    [
      'لوحة تحكم React لمتجر',
      'لوحة إحصائيات وإدارة طلبات.',
      'برمجة وتطوير',
      700,
      1200,
      12,
    ],
  ];
  for (const [title, description, c, min, max, d] of open) {
    await prisma.project.create({
      data: {
        title,
        description,
        categoryId: cat[c],
        budgetMin: min,
        budgetMax: max,
        deadline: days(d),
        clientId: omar.id,
      },
    });
  }

  // ── an OPEN project whose deadline already passed: the midnight job will cancel it ──
  const expired = await prisma.project.create({
    data: {
      title: 'كتابة 10 مقالات SEO (انتهى موعدها)',
      description: 'مثال لمشروع انتهى موعد عروضه — تلغيه مهمة منتصف الليل.',
      categoryId: cat['كتابة وترجمة'],
      budgetMin: 100,
      budgetMax: 200,
      deadline: days(-1),
      clientId: omar.id,
    },
  });
  await prisma.proposal.create({
    data: {
      projectId: expired.id,
      freelancerId: khaled.id,
      price: 150,
      durationDays: 7,
      message: 'أكتب محتوى متوافقاً مع SEO.',
    },
  });

  // ── a finished contract (history): Omar hired Layla for $200, two milestones ──
  const done = await prisma.project.create({
    data: {
      title: 'تصميم واجهات تطبيق حجوزات',
      description: 'تصميم 12 شاشة على Figma.',
      categoryId: cat['تصميم'],
      budgetMin: 150,
      budgetMax: 250,
      deadline: days(-20),
      status: ProjectStatus.COMPLETED,
      clientId: omar.id,
      createdAt: days(-30),
    },
  });
  const accepted = await prisma.proposal.create({
    data: {
      projectId: done.id,
      freelancerId: layla.id,
      price: 200,
      durationDays: 10,
      message: 'جاهزة للبدء.',
      status: ProposalStatus.ACCEPTED,
    },
  });
  const contract = await prisma.contract.create({
    data: {
      projectId: done.id,
      proposalId: accepted.id,
      clientId: omar.id,
      freelancerId: layla.id,
      amount: 200,
      durationDays: 10,
      escrowBalance: 0,
      status: ContractStatus.COMPLETED,
      completedAt: days(-15),
    },
  });
  await prisma.wallet.update({
    where: { id: omar.wallet!.id },
    data: { balance: { decrement: 200 } },
  });
  await prisma.transaction.create({
    data: {
      walletId: omar.wallet!.id,
      type: TransactionType.ESCROW_HOLD,
      amount: 200,
      contractId: contract.id,
    },
  });
  for (const [i, title] of [
    'الشاشات الأساسية',
    'باقي الشاشات ونظام الألوان',
  ].entries()) {
    const m = await prisma.milestone.create({
      data: {
        contractId: contract.id,
        position: i + 1,
        title,
        amount: 100,
        status: MilestoneStatus.APPROVED,
        approvedAt: days(-15),
      },
    });
    const amount = D(100);
    const commission = amount.mul('0.10');
    const payout = amount.sub(commission);
    await prisma.wallet.update({
      where: { id: layla.wallet!.id },
      data: { balance: { increment: payout } },
    });
    await prisma.wallet.update({
      where: { id: platform.id },
      data: { balance: { increment: commission } },
    });
    await prisma.transaction.createMany({
      data: [
        {
          walletId: omar.wallet!.id,
          type: TransactionType.ESCROW_RELEASE,
          amount,
          contractId: contract.id,
          milestoneId: m.id,
        },
        {
          walletId: layla.wallet!.id,
          type: TransactionType.PAYMENT,
          amount: payout,
          contractId: contract.id,
          milestoneId: m.id,
        },
        {
          walletId: platform.id,
          type: TransactionType.COMMISSION,
          amount: commission,
          contractId: contract.id,
          milestoneId: m.id,
        },
      ],
    });
  }
  await prisma.freelancerProfile.update({
    where: { userId: layla.id },
    data: { completedProjects: 1 },
  });
  await prisma.review.createMany({
    data: [
      {
        contractId: contract.id,
        reviewerId: omar.id,
        revieweeId: layla.id,
        rating: 5,
        comment: 'عمل رائع والتزام بالمواعيد.',
      },
      {
        contractId: contract.id,
        reviewerId: layla.id,
        revieweeId: omar.id,
        rating: 4,
        comment: 'عميل واضح في طلباته.',
      },
    ],
  });
  await prisma.user.update({
    where: { id: layla.id },
    data: { ratingSum: 5, ratingCount: 1 },
  });
  await prisma.user.update({
    where: { id: omar.id },
    data: { ratingSum: 4, ratingCount: 1 },
  });

  console.log(`
Demo data ready. Password for every demo account: ${PASSWORD}
  Clients     : sara@demo.local ($600, project with 3 proposals), omar@demo.local
  Freelancers : ahmed@demo.local, layla@demo.local (rated 5★, 1 completed), khaled@demo.local
  Admin       : ${process.env.ADMIN_EMAIL ?? 'admin@freelancehub.local'} / (ADMIN_PASSWORD in .env)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
