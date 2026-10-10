export const ko = {
  region: { brooklyn: '브루클린', nj: '뉴저지', ca: '캘리포니아' },
  freshness: {
    justNow: '방금 확인',
    minutesAgo: (n: number) => `${n}분 전 확인`,
    hoursAgo: (n: number) => `${n}시간 전 확인`,
    daysAgo: (n: number) => `${n}일 전 확인`,
  },
} as const;
