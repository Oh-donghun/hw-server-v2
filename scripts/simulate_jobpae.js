// 직업체질 분포 시뮬레이션 (임시 테스트용)
const { calcJobPaeKey } = require('./engines/scoreEngine');

// 실제 사주 구조 반영:
// - 4기둥(년/월/일/시) × (천간 1 + 지지 지장간 1~3) ≈ 총 7~13개 십신
// - 일간 본인은 제외
// - 10종 십신이 랜덤 배치
function simulateCounts() {
  const total = 7 + Math.floor(Math.random() * 7); // 7~13개

  // 10종 십신 랜덤 생성
  const raw = {
    '정재': 0, '편재': 0,
    '비견': 0, '겁재': 0,
    '식신': 0, '상관': 0,
    '정관': 0, '편관': 0,
    '정인': 0, '편인': 0
  };
  const types = Object.keys(raw);
  for (let i = 0; i < total; i++) {
    raw[types[Math.floor(Math.random() * types.length)]]++;
  }

  return {
    jae:      raw['정재'] + raw['편재'],
    jeongJae: raw['정재'],
    pyeonJae: raw['편재'],
    bigyeop:  raw['비견'] + raw['겁재'],
    siksang:  raw['식신'] + raw['상관'],
    gwansung: raw['정관'] + raw['편관'],
    insung:   raw['정인'] + raw['편인'],
    jeongGwan: raw['정관'],
    sanggwan:  raw['상관'],
    pyeonIn:   raw['편인']
  };
}

const N = 500;
const dist = { wolgeup: 0, jangsa: 0, jeonmun: 0, dokgo: 0, hanbang: 0 };

for (let i = 0; i < N; i++) {
  const counts = simulateCounts();
  const key = calcJobPaeKey(counts);
  dist[key]++;
}

const target = { wolgeup: 30, jangsa: 25, jeonmun: 15, dokgo: 15, hanbang: 15 };
const label  = { wolgeup: '월급', jangsa: '장사', jeonmun: '전문가', dokgo: '독고다이', hanbang: '한방' };

console.log('\n=== 직업체질 분포 시뮬레이션 (N=' + N + ') ===\n');
console.log('체질       | 실제수 | 실제%  | 목표%  | 편차    | 판정');
console.log('-----------|--------|--------|--------|---------|------');
Object.keys(dist).forEach(k => {
  const pct  = (dist[k] / N * 100).toFixed(1);
  const diff = (dist[k] / N * 100 - target[k]).toFixed(1);
  const sign = diff > 0 ? '+' : '';
  const pass = Math.abs(diff) <= 5 ? '✅ 합격' : '❌ 조정 필요';
  const name = label[k].padEnd(5);
  console.log(`${name}      | ${String(dist[k]).padStart(4)}   | ${String(pct).padStart(5)}% | ${String(target[k]).padStart(5)}% | ${sign}${diff}%   | ${pass}`);
});

const total_check = Object.values(dist).reduce((a,b) => a+b, 0);
console.log('\n합계:', total_check, '/ 500');
