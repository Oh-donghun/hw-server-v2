require('dotenv').config();
const KoreanLunarCalendar = require('korean-lunar-calendar');
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios');
const howangpaeData = require('./howangpaeData');
const chogyeonData = require('./chogyeonData');
const jaemulData = require('./jaemulData');
const ageData = require('./ageData');
const jobData = require('./jobData');
const lifeData = require('./lifeData');
const nusuData = require('./nusuData');
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
const { SolapiMessageService } = require('solapi');
const solapi = new SolapiMessageService(process.env.SOLAPI_API_KEY, process.env.SOLAPI_API_SECRET);
const SOLAPI_PFID = process.env.SOLAPI_PFID;
const SOLAPI_SENDER = process.env.SOLAPI_SENDER;

admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const app = express();

app.use(cors());
app.use(express.json());

// ── 모듈화된 라우트 ──
const jaemulRouter = require('./routes/jaemul');
app.use(jaemulRouter);

const gimyeongRouter = require('./routes/gimyeong');  // ← 추가
app.use(gimyeongRouter);                               // ← 추가


// ── 현재 날짜 + 간지 자동 계산 ──
function getCurrentDateContext() {
  const now = new Date();
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const year = kst.getFullYear();
  const month = kst.getMonth() + 1;
  const day = kst.getDate();
  const gan = ['경','신','임','계','갑','을','병','정','무','기'];
  const ganH = ['庚','辛','壬','癸','甲','乙','丙','丁','戊','己'];
  const ji = ['신','유','술','해','자','축','인','묘','진','사','오','미'];
  const jiH = ['申','酉','戌','亥','子','丑','寅','卯','辰','巳','午','未'];
  const animals = ['원숭이','닭','개','돼지','쥐','소','호랑이','토끼','용','뱀','말','양'];
  const gI = year % 10, jI = year % 12;
  const curGanji = gan[gI]+ji[jI], curGanjiH = ganH[gI]+jiH[jI], curAnimal = animals[jI];
  const p1 = year-1, p2 = year-2, n1 = year+1;
  const p1G = gan[p1%10]+ji[p1%12], p1H = ganH[p1%10]+jiH[p1%12];
  const p2G = gan[p2%10]+ji[p2%12], p2H = ganH[p2%10]+jiH[p2%12];
  const n1G = gan[n1%10]+ji[n1%12], n1H = ganH[n1%10]+jiH[n1%12];
  return '오늘은 '+year+'년 '+month+'월 '+day+'일이다.\n'
    +'올해는 '+year+'년 '+curGanji+'('+curGanjiH+')년('+curAnimal+'의 해)이다.\n'
    +'- '+p2+'년은 '+p2G+'('+p2H+')년으로 이미 지나간 해다.\n'
    +'- '+p1+'년은 '+p1G+'('+p1H+')년으로 이미 지나간 해다.\n'
    +'- '+year+'년은 '+curGanji+'('+curGanjiH+')년으로 현재 진행 중인 해다.\n'
    +'- '+(n1)+'년은 '+n1G+'('+n1H+')년이다.\n'
    +'- 고객이 올해라고 하면 반드시 '+year+'년 '+curGanji+'년을 기준으로 답하라.\n'
    +'- 이사, 투자, 이직, 연애 등 시기 관련 답변은 '+year+'년 이후만 답하라.\n'
    +'- 이미 지나간 해를 추천하지 마라.\n'
    +'- 과거 운세는 과거형으로 서술하라.';
}

// gender 정규화: male/female/M/F/m/f/남/여 -> 'male' 또는 'female'
function normalizeGender(raw) {
  if (!raw || raw === '') return 'male';
  const v = String(raw).trim().toLowerCase();
  if (['male','m'].includes(v)) return 'male';
  if (['female','f'].includes(v)) return 'female';
  if (v === '남') return 'male';
  if (v === '여') return 'female';
  return 'male';
}

const PRODUCTS = {
  HW1: { name: '초견', price: 4900, questions: 0 },
  HW2: { name: '재물풀이', price: 19800, questions: 1 },
  HW3: { name: '본풀이', price: 49700, questions: 3 },
  NUSU: { name: '누수처방', price: 9900, questions: 0 }
};
const UPGRADE_PRICES = { HW2: 14900, HW3: 29900, HW2_FROM_NUSU: 9900 };

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'hw-server', time: new Date().toISOString() });
});

app.get('/test-firestore', async (req, res) => {
  try {
    const settings = db._settings || {};
    await db.collection('test').doc('ping').set({ time: new Date().toISOString() });
    const doc = await db.collection('test').doc('ping').get();
    res.json({ success: true, data: doc.data(), projectId: settings.projectId || 'unknown' });
  } catch (e) {
    const settings = db._settings || {};
    res.json({
      success: false, code: e.code, message: e.message,
      projectId: settings.projectId || 'unknown',
      servicePath: settings.servicePath || 'unknown',
      formattedName: db.formattedName || 'unknown'
    });
  }
});


// ── 알림톡 발송 공통 함수 ──
async function sendAlimtalk(phone, templateId, variables, buttons = []) {
  try {
    const msg = {
      to: phone.replace(/-/g, ''),
      from: SOLAPI_SENDER,
      kakaoOptions: {
        pfId: SOLAPI_PFID,
        templateId: templateId,
        variables: variables,
        buttons: buttons
      }
    };
    const result = await solapi.sendOne(msg);
    console.log('알림톡 발송 성공:', templateId, result);
    return result;
  } catch (e) {
    console.error('알림톡 발송 실패:', templateId, e.message);
    return null;
  }
}

app.post('/order', async (req, res) => {
  try {
    const { orderId, product, name, phone, birthDate, calendarType, birthTime, question } = req.body;
    if (!orderId || !product || !name || !phone) return res.status(400).json({ error: 'missing fields' });
    const prod = PRODUCTS[product];
    if (!prod) return res.status(400).json({ error: 'invalid product' });
const isUpgrade = req.body.upgradeFrom ? true : false;
    // 업그레이드 시 gender가 비어있으면 이전 주문에서 가져오기
    let resolvedGender = req.body.gender || '';
    if (isUpgrade && !resolvedGender) {
      try {
        const prevOrder = await db.collection('hw-orders').doc(req.body.upgradeFrom).get();
        if (prevOrder.exists) {
          resolvedGender = prevOrder.data().user?.gender || '';
          console.log('[order] 업그레이드 gender 상속:', req.body.upgradeFrom, '->', resolvedGender);
        }
      } catch(e) { console.error('prev order gender lookup failed:', e.message); }
    }
    let finalPrice = prod.price;
    if (isUpgrade) {
      const fromProduct = req.body.fromProduct || '';
      if (fromProduct === 'NUSU' && product === 'HW2') finalPrice = UPGRADE_PRICES.HW2_FROM_NUSU || 9900;
      else if (UPGRADE_PRICES[product]) finalPrice = UPGRADE_PRICES[product];
    }
    await db.collection('hw-orders').doc(orderId).set({
      orderId, product, productName: prod.name, price: finalPrice, payMethod: 'toss',
      isUpgrade, upgradeFrom: req.body.upgradeFrom || '',
      user: { name, phone, gender: normalizeGender(resolvedGender), birthDate: birthDate || '', calendar: req.body.calendarType || req.body.calType || 'solar', birthTime: birthTime || '' },
      question: question || '', question2: req.body.question2 || '', job: req.body.job || '', marriage: req.body.marriage || '미입력', hasChild: req.body.hasChild || '없음', interest: req.body.interest || '전체', status: 'pending', paymentStatus: 'waiting', questionsLeft: prod.questions,
      nusuCard: req.body.nusuCard || null,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    res.json({ success: true, orderId, productName: prod.name, price: finalPrice });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/confirm', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    const ref = db.collection('hw-orders').doc(orderId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'not found' });
    const orderData = doc.data();
    if (orderData.paymentStatus === 'confirmed') return res.json({ success: true, message: 'already confirmed' });
    await ref.update({ paymentStatus: 'confirmed', status: 'processing', paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });

    // ── 결제 시간별 기록 ──
    try {
      const payToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
      const payHour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).padStart(2, '0');
      const payRef = db.collection('hw-analytics').doc(payToday);
      await payRef.set({ date: payToday, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await payRef.update({ [`hourly.${payHour}.orders`]: FieldValue.increment(1) });
    } catch(ae) { console.error('hourly order track error:', ae.message); }

    // 자동 풀이 생성 (백그라운드)
    if (orderData.product === 'HW1') {
      axios.post(`http://localhost:${PORT}/api/chogyeon`, { orderId }).catch(e => console.error('chogyeon auto:', e.message));
    }
    if (orderData.product === 'HW2') {
      axios.post(`http://localhost:${PORT}/api/jaemul`, { orderId }).catch(e => console.error('jaemul auto:', e.message));
    }
    if (orderData.product === 'HW3') {
      axios.post(`http://localhost:${PORT}/api/bonpuri`, { orderId }).catch(e => console.error('bonpuri auto:', e.message));
    }
    if (orderData.product === 'NUSU') {
      axios.post(`http://localhost:${PORT}/api/v2/nusu-treat`, { orderId }).catch(e => console.error('nusu-treat auto:', e.message));
    }

    // ── 알림톡 1: 결제 완료 ──
    const resultPages = { HW1: 'v2/chogyeon-result.html', HW2: 'v2/jaemul-result.html', HW3: 'v2/bonpuli-result.html', NUSU: 'v2/nusu-result.html' };
    const productNames = { HW1: '초견', HW2: '재물풀이', HW3: '본풀이', NUSU: '누수처방' };
    let _rp = resultPages[orderData.product];
    if (orderData.product === 'HW2' && orderData.isUpgrade && orderData.upgradeFrom) {
      try { const _fo = await db.collection('hw-orders').doc(orderData.upgradeFrom).get();
        if (_fo.exists && _fo.data().product === 'NUSU') _rp = 'v2/jaemul-result-nusu.html';
      } catch(e){}
    }
    const resultURL = `readmelab.github.io/howangdang/${_rp}?id=${orderId}`;
    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    const guideText = orderData.product === 'HW3'
      ? '본풀이는 호왕 할머니가 직접 풀이하여\n완성까지 5~10분 소요됩니다.\n완성되면 카카오톡으로 다시 안내드리겠습니다.'
      : '아래 링크에서 바로 결과를 확인하실 수 있습니다.';

    sendAlimtalk(orderData.user.phone, 'KA01TP260321085423857M5svGoKweVR', {
      '#{이름}': orderData.user.name,
      '#{상품명}': productNames[orderData.product],
      '#{주문번호}': orderId,
      '#{금액}': orderData.price.toLocaleString(),
      '#{결제일시}': now,
      '#{안내문구}': guideText,
      '#{결과URL}': resultURL
    }, [{
      buttonType: 'WL',
      buttonName: '결과 확인하기',
      linkMo: `https://${resultURL}`,
      linkPc: `https://${resultURL}`
    }]);

    /* // ── 알림톡 4: 질문권 안내 (3시간 후) ──
    if (orderData.product === 'HW2' || orderData.product === 'HW3') {
      const questionCount = orderData.product === 'HW3' ? 3 : 1;
      setTimeout(() => {
        sendAlimtalk(orderData.user.phone, 'HW_QUESTION_REMIND', {
          '#{이름}': orderData.user.name,
          '#{상품명}': productNames[orderData.product],
          '#{질문횟수}': String(questionCount),
          '#{결과URL}': resultURL
        }, [{
          buttonType: 'WL',
          buttonName: '질문하러 가기',
          linkMo: `https://${resultURL}`,
          linkPc: `https://${resultURL}`
        }]);
      }, 3 * 60 * 60 * 1000);
    } */

    res.json({ success: true, message: 'confirmed' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/result/:id', async (req, res) => {
  try {
    const doc = await db.collection('hw-results').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, data: doc.data() });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── 호왕에게 물어보기 (Claude 연동) ──
app.post('/ask', async (req, res) => {
  try {
    const { orderId, question } = req.body;
    if (!orderId || !question) return res.status(400).json({ success: false, error: '주문ID와 질문을 입력하세요' });

    // 주문 조회
    const orderSnap = await db.collection('hw-orders').doc(orderId).get();
    if (!orderSnap.exists) return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다' });
    const order = orderSnap.data();

    // 질문 횟수 확인
    const maxQ = order.product === 'HW3' ? 3 : (order.product === 'HW2' ? 1 : 0);
    const usedQ = order.askCount || 0;
    if (usedQ >= maxQ) return res.json({ success: false, error: '질문 횟수를 모두 사용했습니다' });

    // 결과 데이터 조회 (사주 정보 포함)
    const resultSnap = await db.collection('hw-results').doc(orderId).get();
    const resultData = resultSnap.exists ? resultSnap.data() : {};
    const sections = resultData.sections || {};

    // 사주 컨텍스트 구성
    const sajuContext = `
[사주 원국]
- 일간: ${resultData.dayGan || ''}(${resultData.dayGanOheng || ''})
- 신강/신약: ${resultData.strength || ''}
- 사주: ${resultData.fourPillars ? `년${resultData.fourPillars.year} 월${resultData.fourPillars.month} 일${resultData.fourPillars.day} 시${resultData.fourPillars.hour}` : ''}
- 오행비율: 목${resultData.elementGauge?.wood||0}% 화${resultData.elementGauge?.fire||0}% 토${resultData.elementGauge?.earth||0}% 금${resultData.elementGauge?.metal||0}% 수${resultData.elementGauge?.water||0}%
- 용신: ${sections.ch10_yongsin || ''}

[이전 풀이 요약]
- 명식총론: ${sections.ch1_keyword || ''}
- 성격 강점: ${sections.ch2_strength || ''}
- 성격 약점: ${sections.ch2_weakness || ''}
- 재물등급: ${sections.ch3_grade || ''}
- 적성직업: ${(sections.ch4_fit_jobs || []).join(', ')}
- 건강주의: ${(sections.ch6_weak_organs || []).join(', ')}
- 처방: ${sections.ch10_prescription || ''}

[사용자 정보]
- 성별: ${order.user?.gender === 'female' ? '여' : order.user?.gender === 'male' ? '남' : '미입력'}
- 직업: ${resultData.job || order.user?.job || ''}
- 혼인: ${resultData.marriage || ''}
- 관심분야: ${resultData.interest || ''}
`.trim();

    // Claude API 호출
    const claudeRes = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: `${getCurrentDateContext()}

너는 호왕당 할머니다. 50년 경력의 역술가이며, 사주 원국 데이터에 근거하여 답변한다.

규칙:
1. 반말 명령형으로 말한다 ("~해라", "~이다", "~마라")
2. 두루뭉술하게 말하지 않는다. 구체적으로 시기, 방향, 행동을 짚어준다.
3. 앞서 제공된 풀이 내용과 반드시 일관성을 유지한다.
4. 사주 원국(일간, 오행, 용신)을 근거로 답한다.
5. 200자~400자 사이로 답한다.
6. 일상의 비유를 자주 쓴다.
7. 따뜻하지만 단호하게 말한다.`,
      messages: [{
        role: 'user',
        content: `${sajuContext}\n\n[질문]\n${question}\n\n위 사주 데이터와 풀이 결과를 참고하여, 호왕당 할머니 어투로 200~400자 사이의 구체적이고 명쾌한 답변을 해라.`
      }]
    }, {
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    const answer = claudeRes.data?.content?.[0]?.text || '답변을 생성하지 못했습니다.';

    // 질문 횟수 업데이트
    await db.collection('hw-orders').doc(orderId).update({
      askCount: usedQ + 1,
      [`questions.q${usedQ + 1}`]: { question, answer, timestamp: admin.firestore.FieldValue.serverTimestamp() }
    });

    res.json({ success: true, answer, remaining: maxQ - usedQ - 1 });
  } catch (e) {
    console.error('ask error:', e.response?.data || e.message);
    res.status(500).json({ success: false, error: '답변 생성 중 오류가 발생했습니다' });
  }
});


app.post('/api/howangpae', async (req, res) => {
  try {
    const { name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute, calendarType } = req.body;
    if (!birthYear || !birthMonth || !birthDay) return res.status(400).json({ success: false, error: 'birth date required' });
    const gv = normalizeGender(gender) === 'female' ? 'female' : 'male';
    let solarYear = Number(birthYear);
    let solarMonth = Number(birthMonth);
    let solarDay = Number(birthDay);

    if (calendarType === 'lunar') {
      const cal = new KoreanLunarCalendar();
      cal.setLunarDate(Number(birthYear), Number(birthMonth), Number(birthDay), false);
      const sol = cal.getSolarCalendar();
      solarYear = sol.year;
      solarMonth = sol.month;
      solarDay = sol.day;
    }

    const sajuRes = await axios.post('https://naread-saju-1075269376260.asia-northeast3.run.app/saju', {
      name: name || 'howangpae', year: solarYear, month: solarMonth, day: solarDay,
      hour: (birthHour !== undefined && birthHour !== null) ? birthHour : 12,
      minute: (birthMinute !== undefined && birthMinute !== null) ? birthMinute : 0,
      gender: gv === 'male' ? '\uB0A8' : '\uC5EC', calendarType: calendarType || 'solar'
    });
    const saju = sajuRes.data.data;
    const yP = saju.fourPillars.year.hanja;
    const mP = saju.fourPillars.month.hanja;
    const dP = saju.fourPillars.day.hanja;
    const hP = saju.fourPillars.hour.hanja;
    const ganToElement = { '\u7532':'wood','\u4E59':'wood','\u4E19':'fire','\u4E01':'fire','\u620A':'earth','\u5DF1':'earth','\u5E9A':'metal','\u8F9B':'metal','\u58EC':'water','\u7678':'water' };
    const jiToAnimal = { '\u5B50':'rat','\u4E11':'ox','\u5BC5':'tiger','\u536F':'rabbit','\u8FB0':'dragon','\u5DF3':'snake','\u5348':'horse','\u672A':'sheep','\u7533':'monkey','\u9149':'rooster','\u620C':'dog','\u4EA5':'pig' };
    const jiToSeason = { '\u5BC5':'spring','\u536F':'spring','\u8FB0':'spring','\u5DF3':'summer','\u5348':'summer','\u672A':'summer','\u7533':'autumn','\u9149':'autumn','\u620C':'autumn','\u4EA5':'winter','\u5B50':'winter','\u4E11':'winter' };
    const el = ganToElement[yP[0]] || 'wood';
    const an = jiToAnimal[yP[1]] || 'rat';
    const se = jiToSeason[mP[1]] || 'spring';
    const gk = gv === 'male' ? 'm' : 'f';
    const ck = el + '_' + an;
    const ok = ck + '_' + gk;
    const sk = el + '_' + se;
    const oh = saju.oheng;
    const tt = (oh['\uBAA9']||0)+(oh['\uD654']||0)+(oh['\uD1A0']||0)+(oh['\uAE08']||0)+(oh['\uC218']||0);
    const eg = {
      wood: tt ? Math.round(((oh['\uBAA9']||0)/tt)*100) : 0,
      fire: tt ? Math.round(((oh['\uD654']||0)/tt)*100) : 0,
      earth: tt ? Math.round(((oh['\uD1A0']||0)/tt)*100) : 0,
      metal: tt ? Math.round(((oh['\uAE08']||0)/tt)*100) : 0,
      water: tt ? Math.round(((oh['\uC218']||0)/tt)*100) : 0
    };
    const imageUrl = 'https://audio.readmelab.co.kr/howang/howangpae/' + ck + '.jpeg';
    res.json({
      success: true,
      card: {
        id: ck, title: (howangpaeData.titles && howangpaeData.titles[ck]) || ck,
        description: (howangpaeData.descriptions && howangpaeData.descriptions[ck]) || '',
        oneLiner: (howangpaeData.oneLiner && howangpaeData.oneLiner[ok]) || '',
        viralLine: (howangpaeData.viralLine && howangpaeData.viralLine[ck]) || '',
        seasonLine: (howangpaeData.seasonLine && howangpaeData.seasonLine[sk]) || '',
        cta: howangpaeData.cta || '',
        imageUrl: imageUrl, element: el,
        elementKo: (howangpaeData.elementKo && howangpaeData.elementKo[el]) || '',
        animal: an, animalKo: (howangpaeData.animalKo && howangpaeData.animalKo[an]) || '',
        gender: gv, season: se
      },
      spiProperties: {
        dayGan: saju.dayMaster.gan, dayGanOheng: saju.dayMaster.oheng, dayGanYinyang: saju.dayMaster.yinyang,
        fourPillars: { year: yP, month: mP, day: dP, hour: hP },
        fourPillarsHangul: { year: saju.fourPillars.year.hangul, month: saju.fourPillars.month.hangul, day: saju.fourPillars.day.hangul, hour: saju.fourPillars.hour.hangul },
        elementGauge: eg
      }
    });
  } catch (err) {
    console.error('howangpae error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 8080;

// ============ 토스페이먼츠 결제 승인 ============
app.post('/payment/confirm', async (req, res) => {
  try {
    const { paymentKey, orderId, amount } = req.body;
    if (!paymentKey || !orderId || !amount) {
      return res.status(400).json({ success: false, error: 'missing fields' });
    }
    const orderRef = db.collection('hw-orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, error: 'order not found' });
    }
    const orderData = orderDoc.data();
    if (orderData.price !== Number(amount)) {
      return res.status(400).json({ success: false, error: 'amount mismatch' });
    }
    const authKey = Buffer.from(TOSS_SECRET_KEY + ':').toString('base64');
    const tossRes = await axios.post('https://api.tosspayments.com/v1/payments/confirm', {
      paymentKey, orderId, amount: Number(amount)
    }, {
      headers: { 'Authorization': 'Basic ' + authKey, 'Content-Type': 'application/json' }
    });
    await orderRef.update({
      paymentStatus: 'confirmed', status: 'processing', paymentKey: paymentKey,
      payMethod: tossRes.data.method || 'toss',
      paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });

    // ── 결제 시간별 기록 ──
    try {
      const payToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
      const payHour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).padStart(2, '0');
      const payRef = db.collection('hw-analytics').doc(payToday);
      await payRef.set({ date: payToday, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await payRef.update({ [`hourly.${payHour}.orders`]: FieldValue.increment(1) });
    } catch(ae) { console.error('hourly order track error:', ae.message); }

    // 결제 확인 후 자동 풀이 생성 (백그라운드)
    if (orderData.product === 'HW1') {
      axios.post(`http://localhost:${PORT}/api/chogyeon`, { orderId }).catch(e => console.error('chogyeon auto:', e.message));
    }
    if (orderData.product === 'HW2') {
      axios.post(`http://localhost:${PORT}/api/jaemul`, { orderId }).catch(e => console.error('jaemul auto:', e.message));
    }
    if (orderData.product === 'HW3') {
      axios.post(`http://localhost:${PORT}/api/bonpuri`, { orderId }).catch(e => console.error('bonpuri auto:', e.message));
    }
    if (orderData.product === 'NUSU') {
      axios.post(`http://localhost:${PORT}/api/v2/nusu-treat`, { orderId }).catch(e => console.error('nusu-treat auto:', e.message));
    }

    // ── 알림톡 1: 결제 완료 ──
    const resultPages = { HW1: 'v2/chogyeon-result.html', HW2: 'v2/jaemul-result.html', HW3: 'v2/bonpuli-result.html', NUSU: 'v2/nusu-result.html' };
    const productNames = { HW1: '초견', HW2: '재물풀이', HW3: '본풀이', NUSU: '누수처방' };
    let _rp = resultPages[orderData.product];
    if (orderData.product === 'HW2' && orderData.isUpgrade && orderData.upgradeFrom) {
      try { const _fo = await db.collection('hw-orders').doc(orderData.upgradeFrom).get();
        if (_fo.exists && _fo.data().product === 'NUSU') _rp = 'v2/jaemul-result-nusu.html';
      } catch(e){}
    }
    const resultURL = `readmelab.github.io/howangdang/${_rp}?id=${orderId}`;
    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const guideText = orderData.product === 'HW3'
      ? '본풀이는 호왕 할머니가 직접 풀이하여\n완성까지 5~10분 소요됩니다.\n완성되면 카카오톡으로 다시 안내드리겠습니다.'
      : '아래 링크에서 바로 결과를 확인하실 수 있습니다.';

    sendAlimtalk(orderData.user.phone, 'KA01TP260321085423857M5svGoKweVR', {
      '#{이름}': orderData.user.name,
      '#{상품명}': productNames[orderData.product],
      '#{주문번호}': orderId,
      '#{금액}': orderData.price.toLocaleString(),
      '#{결제일시}': now,
      '#{안내문구}': guideText,
      '#{결과URL}': resultURL
    }, [{
      buttonType: 'WL',
      buttonName: '결과 확인하기',
      linkMo: `https://${resultURL}`,
      linkPc: `https://${resultURL}`
    }]);

    /* // ── 알림톡 4: 질문권 안내 (3시간 후) ──
    if (orderData.product === 'HW2' || orderData.product === 'HW3') {
      const questionCount = orderData.product === 'HW3' ? 3 : 1;
      setTimeout(() => {
        sendAlimtalk(orderData.user.phone, 'HW_QUESTION_REMIND', {
          '#{이름}': orderData.user.name,
          '#{상품명}': productNames[orderData.product],
          '#{질문횟수}': String(questionCount),
          '#{결과URL}': resultURL
        }, [{
          buttonType: 'WL',
          buttonName: '질문하러 가기',
          linkMo: `https://${resultURL}`,
          linkPc: `https://${resultURL}`
        }]);
      }, 3 * 60 * 60 * 1000);
    } */

    res.json({ success: true, orderId, method: tossRes.data.method });
  } catch (e) {
    console.error('payment confirm error:', e.response?.data || e.message);
    const msg = e.response?.data?.message || e.message;
    res.status(500).json({ success: false, error: msg });
  }
});

// ============ 관리자: 주문 목록 ============
app.get('/admin/orders', async (req, res) => {
  try {
    if (req.query.pw !== '2991') return res.status(403).json({ success: false, error: 'unauthorized' });
    const snapshot = await db.collection('hw-orders').orderBy('createdAt', 'desc').limit(100).get();
    const orders = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      if (isTestOrder(doc.id, d)) return;
      orders.push({
        ...d,
        createdAt: d.createdAt ? d.createdAt.toDate().toISOString() : null,
        paidAt: d.paidAt ? d.paidAt.toDate().toISOString() : null,
        updatedAt: d.updatedAt ? d.updatedAt.toDate().toISOString() : null
      });
    });
    res.json({ success: true, orders });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============ 관리자: 풀이 완료 처리 ============
app.post('/admin/done', async (req, res) => {
  try {
    const { orderId, pw } = req.body;
    if (pw !== '2991') return res.status(403).json({ success: false, error: 'unauthorized' });
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' });
    await db.collection('hw-orders').doc(orderId).update({
      status: 'done', updatedAt: FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============ 초견 풀이 API ============
app.post('/api/chogyeon', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' });
    const orderDoc = await db.collection('hw-orders').doc(orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ success: false, error: 'order not found' });
    const order = orderDoc.data();
    if (order.paymentStatus !== 'confirmed') return res.status(400).json({ success: false, error: 'payment not confirmed' });
    if (order.product !== 'HW1') return res.status(400).json({ success: false, error: 'not HW1 order, skip chogyeon' });

    const birthStr = order.user.birthDate || '';
    const timeStr = order.user.birthTime || '';
    let yearMatch = birthStr.match(/(\d{4})/);
    let monthMatch = birthStr.match(/(\d{1,2})월/);
    let dayMatch = birthStr.match(/(\d{1,2})일/);
    const isLunar = birthStr.includes('음력') || order.user.calendar === 'lunar';

    // 폴백: "1990? 6? 15?" 또는 "1990-06-15" 또는 "1990/6/15"
    if (!monthMatch || !dayMatch) {
      const fallback = birthStr.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
      if (fallback) {
        yearMatch = [null, fallback[1]];
        monthMatch = [null, fallback[2]];
        dayMatch = [null, fallback[3]];
      }
    }

    if (!yearMatch || !monthMatch || !dayMatch) {
      return res.status(400).json({ success: false, error: 'birth date parse failed' });
    }

    let solarYear = Number(yearMatch[1]);
    let solarMonth = Number(monthMatch[1]);
    let solarDay = Number(dayMatch[1]);

    if (isLunar) {
      const cal = new KoreanLunarCalendar();
      cal.setLunarDate(solarYear, solarMonth, solarDay, false);
      const sol = cal.getSolarCalendar();
      solarYear = sol.year; solarMonth = sol.month; solarDay = sol.day;
    }

    let hour = 12;
    const hourMatch = timeStr.match(/(\d{1,2})시/);
    if (hourMatch) hour = Number(hourMatch[1]);

    const gender = normalizeGender(order.user.gender);
    const sajuRes = await axios.post('https://naread-saju-1075269376260.asia-northeast3.run.app/saju', {
      name: order.user.name || 'chogyeon',
      year: solarYear, month: solarMonth, day: solarDay,
      hour: hour, minute: 0,
      gender: gender === 'male' ? '남' : '여',
      calendarType: 'solar'
    });
    const saju = sajuRes.data.data;
    const dayGan = saju.dayMaster.gan;
    const dayOheng = saju.dayMaster.oheng;
    const ohengMap = { '목': 'wood', '화': 'fire', '토': 'earth', '금': 'metal', '수': 'water' };
    const dayElement = ohengMap[dayOheng] || 'wood';
    const oh = saju.oheng;
    const total = (oh['목']||0) + (oh['화']||0) + (oh['토']||0) + (oh['금']||0) + (oh['수']||0);
    const dayPct = total ? Math.round(((oh[dayOheng]||0) / total) * 100) : 0;
    const strength = dayPct >= 25 ? 'strong' : 'weak';

    const elementGauge = {
      wood: total ? Math.round(((oh['목']||0)/total)*100) : 0,
      fire: total ? Math.round(((oh['화']||0)/total)*100) : 0,
      earth: total ? Math.round(((oh['토']||0)/total)*100) : 0,
      metal: total ? Math.round(((oh['금']||0)/total)*100) : 0,
      water: total ? Math.round(((oh['수']||0)/total)*100) : 0
    };

    const summaryKey = dayGan + '_' + strength;
    const summary = chogyeonData.summary[summaryKey] || chogyeonData.summary['甲_strong'];
    const personality = chogyeonData.personality[dayGan] || chogyeonData.personality['甲'];

const pillars = saju.fourPillars;
const sipseong = saju.sipseong || {};
const allSipsin = [];
['year','month','day','hour'].forEach(p => {
  if (sipseong[p]) {
    if (sipseong[p].gan && sipseong[p].gan !== '일간') {
      allSipsin.push(sipseong[p].gan);
    }
    if (sipseong[p].ji) {
      sipseong[p].ji.forEach(j => {
        if (j.sipseong) allSipsin.push(j.sipseong);
      });
    }
  }
});

    const jaeCount = allSipsin.filter(s => s && (s.includes('정재') || s.includes('편재'))).length;
    const hasJeongJae = allSipsin.filter(s => s && s.includes('정재')).length >= 2;
    const hasPyeonJae = allSipsin.filter(s => s && s.includes('편재')).length >= 2;
    const hasBigyeop = allSipsin.filter(s => s && (s.includes('비견') || s.includes('겁재'))).length >= 3;
    const hasSiksang = allSipsin.filter(s => s && (s.includes('식신') || s.includes('상관'))).length >= 3;

    let wealthKey = 'both_weak';
    if (hasBigyeop && (hasJeongJae || hasPyeonJae)) wealthKey = 'leak';
    else if (hasSiksang && (hasJeongJae || hasPyeonJae)) wealthKey = 'skill';
    else if (hasJeongJae && hasPyeonJae) wealthKey = 'both_strong';
    else if (hasJeongJae) wealthKey = 'jeong_strong';
    else if (hasPyeonJae) wealthKey = 'pyeon_strong';

    const choOheng = { '甲':'wood','乙':'wood','丙':'fire','丁':'fire','戊':'earth','己':'earth','庚':'metal','辛':'metal','壬':'water','癸':'water' }[dayGan] || 'wood';
    const wealth = chogyeonData.wealth[wealthKey + '_' + choOheng] || chogyeonData.wealth[wealthKey];
    const yearFortune = chogyeonData.yearFortune[dayGan] || chogyeonData.yearFortune['甲'];

    let hoTongKey = 'balanced';
    const maxElement = Object.entries(elementGauge).sort((a,b) => b[1]-a[1])[0];
    if (maxElement[1] >= 38) {
      const excessMap = { wood: 'wood_excess', fire: 'fire_excess', earth: 'earth_excess', metal: 'metal_excess', water: 'water_excess' };
      hoTongKey = excessMap[maxElement[0]] || 'balanced';
    }
    const hoTong = chogyeonData.hoTong[hoTongKey];
    const relationship = chogyeonData.relationship[dayGan] || chogyeonData.relationship['甲'];
    const health = chogyeonData.health[dayGan] || chogyeonData.health['甲'];

    const resultData = {
      orderId, productName: order.productName, userName: order.user.name,
      dayGan, dayGanOheng: dayOheng, strength,
      fourPillars: { year: pillars.year.hanja, month: pillars.month.hanja, day: pillars.day.hanja, hour: pillars.hour.hanja },
      fourPillarsHangul: { year: pillars.year.hangul, month: pillars.month.hangul, day: pillars.day.hangul, hour: pillars.hour.hangul },
      elementGauge,
      sections: { summary, personality, wealth, relationship, health, yearFortune, hoTong },
      wealthType: wealthKey, hoTongType: hoTongKey,
      createdAt: FieldValue.serverTimestamp()
    };

    await db.collection('hw-results').doc(orderId).set(resultData);

    // ── 알림톡: 초견 결과 안내 ──
    res.json({ success: true, result: resultData });
  } catch (e) {
    console.error('chogyeon error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============ 이미지 프록시 (CORS 우회용) ============
app.get('/proxy-image', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl || !imageUrl.startsWith('https://audio.readmelab.co.kr/')) {
      return res.status(400).json({ error: 'invalid url' });
    }
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.set({ 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' });
    res.send(Buffer.from(response.data));
  } catch (e) {
    res.status(500).json({ error: 'proxy failed' });
  }
});


// ============ 주문 정보 조회 (업그레이드용) ============
app.get('/order-info/:id', async (req, res) => {
  try {
    const doc = await db.collection('hw-orders').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'not found' });
    res.json({ success: true, data: doc.data() });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

/* // ============ 재물풀이 API ============ (모듈화로 routes/jaemul.js로 이동)
app.post('/api/jaemul', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' });
    const orderDoc = await db.collection('hw-orders').doc(orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ success: false, error: 'order not found' });
    const order = orderDoc.data();
    if (order.paymentStatus !== 'confirmed') return res.status(400).json({ success: false, error: 'payment not confirmed' });
    if (order.product !== 'HW2') return res.status(400).json({ success: false, error: 'not HW2 order, skip jaemul' });

    // ── 생년월일 파싱 ──
    const birthStr = order.user.birthDate || '';
    const timeStr = order.user.birthTime || '';
    let yearMatch = birthStr.match(/(\d{4})/);
    let monthMatch = birthStr.match(/(\d{1,2})월/);
    let dayMatch = birthStr.match(/(\d{1,2})일/);
    const isLunar = birthStr.includes('음력') || order.user.calendar === 'lunar';

    if (!monthMatch || !dayMatch) {
      const fallback = birthStr.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
      if (fallback) {
        yearMatch = [null, fallback[1]];
        monthMatch = [null, fallback[2]];
        dayMatch = [null, fallback[3]];
      }
    }

    if (!yearMatch || !monthMatch || !dayMatch) {
      return res.status(400).json({ success: false, error: 'birth date parse failed' });
    }

    let solarYear = Number(yearMatch[1]);
    let solarMonth = Number(monthMatch[1]);
    let solarDay = Number(dayMatch[1]);

    if (isLunar) {
      const cal = new KoreanLunarCalendar();
      cal.setLunarDate(solarYear, solarMonth, solarDay, false);
      const sol = cal.getSolarCalendar();
      solarYear = sol.year; solarMonth = sol.month; solarDay = sol.day;
    }

    let hour = 12;
    const hourMatch = timeStr.match(/(\d{1,2})시/);
    if (hourMatch) hour = Number(hourMatch[1]);

    const gender = normalizeGender(order.user.gender);

    // ── 사주 API 호출 ──
    const sajuRes = await axios.post('https://naread-saju-1075269376260.asia-northeast3.run.app/saju', {
      name: order.user.name || 'jaemul',
      year: solarYear, month: solarMonth, day: solarDay,
      hour: hour, minute: 0,
      gender: gender === 'male' ? '남' : '여',
      calendarType: 'solar'
    });
    const saju = sajuRes.data.data;
    const dayGan = saju.dayMaster.gan;
    const dayOheng = saju.dayMaster.oheng;
    const ohengMap = { '목': 'wood', '화': 'fire', '토': 'earth', '금': 'metal', '수': 'water' };
    const dayElement = ohengMap[dayOheng] || 'wood';

    // ── 오행 비율 계산 ──
    const oh = saju.oheng;
    const total = (oh['목']||0) + (oh['화']||0) + (oh['토']||0) + (oh['금']||0) + (oh['수']||0);
    const dayPct = total ? Math.round(((oh[dayOheng]||0) / total) * 100) : 0;
    const strength = dayPct >= 25 ? 'strong' : 'weak';

    const elementGauge = {
      wood: total ? Math.round(((oh['목']||0)/total)*100) : 0,
      fire: total ? Math.round(((oh['화']||0)/total)*100) : 0,
      earth: total ? Math.round(((oh['토']||0)/total)*100) : 0,
      metal: total ? Math.round(((oh['금']||0)/total)*100) : 0,
      water: total ? Math.round(((oh['수']||0)/total)*100) : 0
    };

    // ── 십신 분석 ──
const pillars = saju.fourPillars;
const sipseong = saju.sipseong || {};
const allSipsin = [];
['year','month','day','hour'].forEach(p => {
  if (sipseong[p]) {
    if (sipseong[p].gan && sipseong[p].gan !== '일간') {
      allSipsin.push(sipseong[p].gan);
    }
    if (sipseong[p].ji) {
      sipseong[p].ji.forEach(j => {
        if (j.sipseong) allSipsin.push(j.sipseong);
      });
    }
  }
});

    const hasJeongJae = allSipsin.filter(s => s && s.includes('정재')).length >= 2;
    const hasPyeonJae = allSipsin.filter(s => s && s.includes('편재')).length >= 2;
    const hasBigyeop = allSipsin.filter(s => s && (s.includes('비견') || s.includes('겁재'))).length >= 3;
    const hasSiksang = allSipsin.filter(s => s && (s.includes('식신') || s.includes('상관'))).length >= 3;
    const hasGwansung = allSipsin.filter(s => s && (s.includes('정관') || s.includes('편관'))).length >= 2;
    const hasInsung = allSipsin.filter(s => s && (s.includes('정인') || s.includes('편인'))).length >= 2;
    const gwansungCount = allSipsin.filter(s => s && (s.includes('정관') || s.includes('편관'))).length;
    const siksangCount = allSipsin.filter(s => s && (s.includes('식신') || s.includes('상관'))).length;
    const insungCount = allSipsin.filter(s => s && (s.includes('정인') || s.includes('편인'))).length;
    const jaeCount = allSipsin.filter(s => s && (s.includes('정재') || s.includes('편재'))).length;
    const bigyeopCount = allSipsin.filter(s => s && (s.includes('비견') || s.includes('겁재'))).length;

    // ── 섹션 1: 재물 총론 ──
    const overviewKey = dayGan + '_' + strength;
    const overview = jaemulData.overview[overviewKey] || jaemulData.overview['甲_strong'];

    // 재물 종합 등급 계산
    let wealthScore = 2;
    if (hasJeongJae && hasPyeonJae) wealthScore += 1.5;
    else if (hasJeongJae || hasPyeonJae) wealthScore += 0.5;
    if (hasSiksang && (hasJeongJae || hasPyeonJae)) wealthScore += 1;
    if (hasBigyeop) wealthScore -= 1;
    if (strength === 'strong') wealthScore += 0.5;
    if (jaeCount >= 4) wealthScore += 0.5;
    wealthScore = Math.max(1, Math.min(5, Math.round(wealthScore)));
    const gradeMap = { 5: 'S', 4: 'A', 3: 'B', 2: 'C', 1: 'D' };
    const wealthGrade = gradeMap[wealthScore] || 'B';

    // ── 섹션 2: 돈 그릇 ──
    let vesselKey = 'both_weak';
    if (hasBigyeop && (hasJeongJae || hasPyeonJae)) vesselKey = 'leak';
    else if (hasSiksang && (hasJeongJae || hasPyeonJae)) vesselKey = 'skill';
    else if (hasJeongJae && hasPyeonJae) vesselKey = 'both_strong';
    else if (hasJeongJae) vesselKey = 'jeong_strong';
    else if (hasPyeonJae) vesselKey = 'pyeon_strong';
    let moneyVessel = jaemulData.moneyVessel[vesselKey];

    // 그릇 크기 퍼센트 (시각화용)
    const vesselSizeMap = { both_strong: 90, jeong_strong: 70, pyeon_strong: 75, skill: 80, both_weak: 40, leak: 55 };
    const vesselSize = vesselSizeMap[vesselKey] || 50;
    const vesselLabel = vesselSize >= 80 ? '큰 솥' : vesselSize >= 60 ? '항아리' : vesselSize >= 40 ? '사발' : '찻잔';

    // ── 섹션 3: 돈의 통로 ──
    let channelKey = 'mixed';
    if (gwansungCount >= 4) channelKey = 'official';
    else if (siksangCount >= 4) channelKey = 'creative';
    else if (bigyeopCount >= 4) channelKey = 'network';
    else if (insungCount >= 4) channelKey = 'knowledge';
    else if (jaeCount >= 4) channelKey = 'finance';
    else {
      const maxCount = Math.max(gwansungCount, siksangCount, bigyeopCount, insungCount, jaeCount);
      if (maxCount >= 3) {
        if (gwansungCount === maxCount) channelKey = 'official';
        else if (siksangCount === maxCount) channelKey = 'creative';
        else if (bigyeopCount === maxCount) channelKey = 'network';
        else if (insungCount === maxCount) channelKey = 'knowledge';
        else if (jaeCount === maxCount) channelKey = 'finance';
      }
    }
    const moneyChannel = jaemulData.moneyChannel[channelKey];

// 통로 게이지 - 오행 기반 차등 부여
const channelBase = {
    official: gwansungCount * 10,
    creative: siksangCount * 10,
    network: bigyeopCount * 10,
    knowledge: insungCount * 10,
    finance: jaeCount * 10
};
// 오행 성향에 따른 기본 보정 (전부 0일 때 차등이 생기도록)
const elementBonus = {
    wood:  { official: 15, creative: 30, network: 25, knowledge: 25, finance: 20 },
    fire:  { official: 20, creative: 30, network: 25, knowledge: 20, finance: 15 },
    earth: { official: 30, creative: 15, network: 20, knowledge: 20, finance: 30 },
    metal: { official: 25, creative: 20, network: 20, knowledge: 25, finance: 30 },
    water: { official: 20, creative: 25, network: 30, knowledge: 30, finance: 20 }
};
const bonus = elementBonus[dayElement] || elementBonus['wood'];
const channelGauge = {
  official: Math.min(100, channelBase.official + bonus.official),
  creative: Math.min(100, channelBase.creative + bonus.creative),
  network: Math.min(100, channelBase.network + bonus.network),
  knowledge: Math.min(100, channelBase.knowledge + bonus.knowledge),
  finance: Math.min(100, channelBase.finance + bonus.finance)
};

    // ── 섹션 4: 누수 패턴 ──
    // 경로 1: 누수처방(NUSU)에서 업그레이드한 경우 → 기존 진단 그대로 사용
    // 경로 2: 바로 재물풀이 구매한 경우 → 자체 계산
    let leakKey = 'unconscious';
    let leakScores = {};
    let leakPattern;
    let leakLevel;
    let leakLabel;
    let totalPressure, defense, finalLeakScore;

    const upgradeFromId = order.upgradeFrom || '';
    let usedNusuData = false;

    if (upgradeFromId) {
      // 이전 주문에서 누수 데이터 가져오기 시도
      try {
        const prevDoc = await db.collection('hw-orders').doc(upgradeFromId).get();
        if (prevDoc.exists) {
          const prev = prevDoc.data();
          // NUSU 주문이고 nusuTreat 데이터가 있는 경우
          if (prev.product === 'NUSU' && prev.nusuTreat) {
            leakKey = prev.nusuTreat.leakKey || 'unconscious';
            leakLevel = prev.nusuTreat.leakLevel || 3;
            leakScores = prev.nusuTreat.leakScores || prev.nusuCard?.leakScores || {};
            leakPattern = prev.nusuTreat.chapters?.ch1 
              ? `${prev.nusuTreat.chapters.ch1.substring(0, 200)}…` 
              : jaemulData.leakPattern[leakKey];
            usedNusuData = true;
            console.log(`[jaemul] 누수처방 데이터 연동: leakKey=${leakKey}, leakLevel=${leakLevel}`);
          }
          // nusuCard만 있는 경우 (nusuTreat 생성 전)
          else if (prev.nusuCard && prev.nusuCard.leakKey) {
            leakKey = prev.nusuCard.leakKey || 'unconscious';
            leakLevel = prev.nusuCard.leakLevel || 3;
            leakScores = prev.nusuCard.leakScores || {};
            leakPattern = jaemulData.leakPattern[leakKey];
            usedNusuData = true;
            console.log(`[jaemul] 누수카드 데이터 연동: leakKey=${leakKey}, leakLevel=${leakLevel}`);
          }
        }
      } catch (e) {
        console.log(`[jaemul] 이전 주문 조회 실패, 자체 계산으로 전환: ${e.message}`);
      }
    }

    if (!usedNusuData) {
      // 바로 재물풀이 구매 → 자체 계산
      leakScores = {
        people: bigyeopCount >= 3 ? bigyeopCount * 2 : bigyeopCount,
        desire: siksangCount >= 3 ? siksangCount * 2 : siksangCount,
        pride: gwansungCount >= 3 ? gwansungCount * 2 : gwansungCount,
        learning: insungCount >= 3 ? insungCount * 2 : insungCount
      };
      const maxLeak = Object.entries(leakScores).sort((a,b) => b[1] - a[1])[0];
      const topScore = maxLeak[1];
      if (topScore >= 4) leakKey = maxLeak[0];
      leakPattern = jaemulData.leakPattern[leakKey];

      totalPressure = Object.values(leakScores).reduce((a,b) => a+b, 0);
      defense = Math.min(jaeCount * 2, 6);
      finalLeakScore = Math.max(0, topScore + Math.floor(totalPressure / 4) - defense);
      if (finalLeakScore <= 1) leakLevel = 1;
      else if (finalLeakScore <= 4) leakLevel = 2;
      else if (finalLeakScore <= 7) leakLevel = 3;
      else if (finalLeakScore <= 10) leakLevel = 4;
      else leakLevel = 5;
    }

    if (!leakPattern) leakPattern = jaemulData.leakPattern[leakKey] || jaemulData.leakPattern['unconscious'];
    const leakLabelMap = { 1: '양호', 2: '주의', 3: '경고', 4: '위험', 5: '심각' };
    leakLabel = leakLabelMap[leakLevel] || '보통';


    // ── 섹션 5: 투자 적성 ──
    const investType = jaemulData.investType[dayElement] || jaemulData.investType['wood'];

    // 투자 레이더 (시각화용) ? 오행에 따라 적성 점수
    const investRadarMap = {
      wood:  { realestate: 40, stock: 70, business: 60, saving: 30, crypto: 50 },
      fire:  { realestate: 30, stock: 80, business: 70, saving: 20, crypto: 60 },
      earth: { realestate: 90, stock: 30, business: 50, saving: 70, crypto: 20 },
      metal: { realestate: 60, stock: 80, business: 40, saving: 60, crypto: 30 },
      water: { realestate: 50, stock: 60, business: 50, saving: 50, crypto: 40 }
    };
    const investRadar = investRadarMap[dayElement] || investRadarMap['wood'];

    // ── 섹션 6: 직업 궁합 ──
    const job = order.job || '직장인';
    const lifeKey = lifeData.getLifeKey(order.marriage || '미혼', order.hasChild || '없음');
    const jobKey = job + '_' + dayElement;
    const jobMatch = jaemulData.jobMatch[jobKey] || jaemulData.jobMatch['직장인_wood'];

    // 직업 궁합 점수 (시각화용)
    const jobScoreBase = {
      사업_fire: 92, 사업_earth: 85, 사업_wood: 78, 사업_water: 75, 사업_metal: 80,
      직장인_earth: 90, 직장인_metal: 88, 직장인_wood: 82, 직장인_water: 78, 직장인_fire: 75,
      프리랜서_fire: 90, 프리랜서_metal: 88, 프리랜서_water: 82, 프리랜서_wood: 80, 프리랜서_earth: 72,
      주부_earth: 88, 주부_water: 85, 주부_fire: 80, 주부_metal: 78, 주부_wood: 75,
      취준생_wood: 85, 취준생_fire: 82, 취준생_earth: 80, 취준생_metal: 88, 취준생_water: 78,
      학생_wood: 85, 학생_water: 82, 학생_metal: 88, 학생_fire: 78, 학생_earth: 80
    };
    const jobScore = jobScoreBase[jobKey] || 75;

    // ── 섹션 7: 월별 흐름 ──
    const monthlyFortune = jaemulData.monthlyFortune[dayGan] || jaemulData.monthlyFortune['甲'];

    // ── 섹션 8: 3년 흐름 ──
    const threeYear = jaemulData.threeYearFlow[dayGan] || jaemulData.threeYearFlow['甲'];

    // ── 섹션 9: 돈 습관 ──
    let habitKey = 'balanced';
    const maxEl = Object.entries(elementGauge).sort((a,b) => b[1]-a[1])[0];
    if (maxEl[1] >= 38) {
      const habitMap = { wood: 'wood_excess', fire: 'fire_excess', earth: 'earth_excess', metal: 'metal_excess', water: 'water_excess' };
      habitKey = habitMap[maxEl[0]] || 'balanced';
    }
    let moneyHabit = jaemulData.moneyHabit[habitKey];

    // 실천 체크리스트 (시각화용)
    const habitChecklist = {
      fire_excess: ['큰 지출 앞에서 3일 냉각기', '매주 물가 산책 30분', '충동구매 금지 앱 설치'],
      water_excess: ['매일 아침 재무 할 일 1개 정하기', '주 1회 등산 또는 텃밭', '생각 전에 행동 먼저'],
      wood_excess: ['한 달 재무 목표 1개만', '주 1회 정리정돈', '안 되는 건 과감히 포기'],
      metal_excess: ['한 달 1회 새로운 경험', '70% 확신이면 실행', '완벽주의 내려놓기'],
      earth_excess: ['매달 고정비 10% 줄이기', '안 쓰는 구독 전부 해지', '새로운 배움 1개 시작'],
      balanced: ['수입의 20% 자동이체 저축', '분기별 재무 점검', '가계부 주 1회 작성']
    };
    const checklist = habitChecklist[habitKey] || habitChecklist['balanced'];

    // ── 섹션 10: 재물 호통 ──
    let wealthHoTong = jaemulData.wealthHoTong[vesselKey] || jaemulData.wealthHoTong['both_weak'];

    // 호통 강도 (시각화용)
    const hoTongIntensityMap = { leak: 5, both_weak: 4, pyeon_strong: 4, skill: 3, jeong_strong: 3, both_strong: 3 };
    const hoTongIntensity = hoTongIntensityMap[vesselKey] || 3;

    // ── 초견 결과 참조 (일관성 유지) ──
    let chogyeonRef = null;
    const chogyeonDoc = await db.collection('hw-results').doc(order.upgradeFrom || orderId).get();
    if (chogyeonDoc.exists) {
      chogyeonRef = chogyeonDoc.data();
    }

    // ── 가정상황 꼬리 텍스트 ──
    const vesselLifeTail = jaemulData.vesselLife ? (jaemulData.vesselLife[vesselKey + '_' + lifeKey] || '') : '';
    const leakLifeTail = jaemulData.leakLife ? (jaemulData.leakLife[leakKey + '_' + lifeKey] || '') : '';
    const habitLifeTail = jaemulData.habitLife ? (jaemulData.habitLife[habitKey + '_' + lifeKey] || '') : '';
    const hoTongLifeTail = jaemulData.hoTongLife ? (jaemulData.hoTongLife[vesselKey + '_' + lifeKey] || '') : '';
    if (vesselLifeTail) moneyVessel = moneyVessel + ' ' + vesselLifeTail;
    if (leakLifeTail) leakPattern = leakPattern + ' ' + leakLifeTail;
    if (habitLifeTail) moneyHabit = moneyHabit + ' ' + habitLifeTail;
    if (hoTongLifeTail) wealthHoTong = wealthHoTong + ' ' + hoTongLifeTail;

// ── 결과 조립 ──
      const resultData = {
      orderId,
      productName: '재물풀이',
      userName: order.user.name,
      job: job,
      dayGan,
      dayGanOheng: dayOheng,
      dayElement,
      strength,
      fourPillars: {
        year: pillars.year.hanja, month: pillars.month.hanja,
        day: pillars.day.hanja, hour: pillars.hour.hanja
      },
      fourPillarsHangul: {
        year: pillars.year.hangul, month: pillars.month.hangul,
        day: pillars.day.hangul, hour: pillars.hour.hangul
      },
      elementGauge,
      wealthGrade,
      wealthScore,
      vesselKey,
      vesselSize,
      vesselLabel,
      channelKey,
      channelGauge,
      leakKey,
      leakLevel,
      leakLabel,
      lifeKey,
      investRadar,
      jobScore,
      hoTongIntensity,
      checklist,
      sections: {
        overview,
        moneyVessel,
        moneyChannel,
        leakPattern,
        investType,
        jobMatch,
        monthlyFortune,
        threeYearFlow: threeYear,
        moneyHabit,
        wealthHoTong
      },
chogyeonRef: chogyeonRef ? {
  dayGan: chogyeonRef.dayGan || '',
  strength: chogyeonRef.strength || '',
  wealthType: chogyeonRef.wealthType || ''
} : null,
      createdAt: FieldValue.serverTimestamp()
    };

await db.collection('hw-results').doc(orderId).set(resultData);

    // ── 알림톡: 재물풀이 결과 안내 ──
    res.json({ success: true, result: resultData });

  } catch (e) {
    console.error('bonpuri error:', e.response?.data || e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============ 재물풀이 API 끝 ============ */
// ============ 본풀이 API (Claude 연동) ============
app.post('/api/bonpuri', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' });
    const orderDoc = await db.collection('hw-orders').doc(orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ success: false, error: 'order not found' });
    const order = orderDoc.data();
    if (order.paymentStatus !== 'confirmed') return res.status(400).json({ success: false, error: 'payment not confirmed' });
    if (order.product !== 'HW3') return res.status(400).json({ success: false, error: 'not HW3 order, skip bonpuri' });

    // ── 생년월일 파싱 ──
    const birthStr = order.user.birthDate || '';
    const timeStr = order.user.birthTime || '';
    let yearMatch = birthStr.match(/(\d{4})/);
    let monthMatch = birthStr.match(/(\d{1,2})월/);
    let dayMatch = birthStr.match(/(\d{1,2})일/);
    const isLunar = birthStr.includes('음력') || order.user.calendar === 'lunar';

    if (!monthMatch || !dayMatch) {
      const fallback = birthStr.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
      if (fallback) {
        yearMatch = [null, fallback[1]];
        monthMatch = [null, fallback[2]];
        dayMatch = [null, fallback[3]];
      }
    }
    if (!yearMatch || !monthMatch || !dayMatch) {
      return res.status(400).json({ success: false, error: 'birth date parse failed' });
    }

    let solarYear = Number(yearMatch[1]);
    let solarMonth = Number(monthMatch[1]);
    let solarDay = Number(dayMatch[1]);

    if (isLunar) {
      const cal = new KoreanLunarCalendar();
      cal.setLunarDate(solarYear, solarMonth, solarDay, false);
      const sol = cal.getSolarCalendar();
      solarYear = sol.year; solarMonth = sol.month; solarDay = sol.day;
    }

    let hour = 12;
    const hourMatch = timeStr.match(/(\d{1,2})시/);
    if (hourMatch) hour = Number(hourMatch[1]);

    const gender = normalizeGender(order.user.gender);
    // ── 사주 API 호출 ──
    const sajuRes = await axios.post('https://naread-saju-1075269376260.asia-northeast3.run.app/saju', {
      name: order.user.name || 'bonpuri',
      year: solarYear, month: solarMonth, day: solarDay,
      hour: hour, minute: 0,
      gender: gender === 'male' ? '남' : '여',
      calendarType: 'solar'
    });
    const saju = sajuRes.data.data;
    const dayGan = saju.dayMaster.gan;
    const dayOheng = saju.dayMaster.oheng;
    const ohengMap = { '목': 'wood', '화': 'fire', '토': 'earth', '금': 'metal', '수': 'water' };
    const dayElement = ohengMap[dayOheng] || 'wood';

    const oh = saju.oheng;
    const total = (oh['목']||0) + (oh['화']||0) + (oh['토']||0) + (oh['금']||0) + (oh['수']||0);
    const dayPct = total ? Math.round(((oh[dayOheng]||0) / total) * 100) : 0;
    const strength = dayPct >= 25 ? 'strong' : 'weak';

    const elementGauge = {
      wood: total ? Math.round(((oh['목']||0)/total)*100) : 0,
      fire: total ? Math.round(((oh['화']||0)/total)*100) : 0,
      earth: total ? Math.round(((oh['토']||0)/total)*100) : 0,
      metal: total ? Math.round(((oh['금']||0)/total)*100) : 0,
      water: total ? Math.round(((oh['수']||0)/total)*100) : 0
    };

    const pillars = saju.fourPillars;
const sipseong = saju.sipseong || {};
const allSipsin = [];
['year','month','day','hour'].forEach(p => {
  if (sipseong[p]) {
    if (sipseong[p].gan && sipseong[p].gan !== '일간') {
      allSipsin.push(sipseong[p].gan);
    }
    if (sipseong[p].ji) {
      sipseong[p].ji.forEach(j => {
        if (j.sipseong) allSipsin.push(j.sipseong);
      });
    }
  }
});

    // ── 이전 풀이 결과 조회 ──
    let prevChogyeon = null;
    let prevJaemul = null;
    const upgradeFrom = order.upgradeFrom || '';

    if (upgradeFrom) {
      const cDoc = await db.collection('hw-results').doc(upgradeFrom).get();
      if (cDoc.exists) {
        const cData = cDoc.data();
        if (cData.productName === '초견') prevChogyeon = cData;
        if (cData.productName === '재물풀이') prevJaemul = cData;
      }
      // 재물풀이에서 온 경우, 재물풀이의 upgradeFrom으로 초견도 찾기
      if (prevJaemul && !prevChogyeon) {
        const jOrder = await db.collection('hw-orders').doc(upgradeFrom).get();
        if (jOrder.exists && jOrder.data().upgradeFrom) {
          const cDoc2 = await db.collection('hw-results').doc(jOrder.data().upgradeFrom).get();
          if (cDoc2.exists) prevChogyeon = cDoc2.data();
        }
      }
    }

    // ── Claude API 호출 ──
    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ success: false, error: 'Claude API key not configured' });
    }

   const currentYear = new Date().getFullYear();

    const dateContext = getCurrentDateContext();
    const systemPrompt = `너는 '호왕당 할머니'다. 70대 무당 할머니로, 사주를 50년 넘게 봐왔다.

## 현재 날짜 정보
${dateContext}

## 말투 규칙
- 반말로 말한다. "~해라", "~이다", "~하지 마라"
- 짧고 단정하게 끊는다. 한 문장이 40자를 넘지 않게.
- 애매하게 말하지 않는다. "~할 수도 있다", "~일 가능성이 있다" 금지.
- 단정적으로 말한다. "~이다", "~해라", "~하지 마라"
- 비유를 자주 쓴다. 일상적이고 직관적인 비유.
- 따뜻하지만 직설적이다. 아픈 말도 한다.

## 풀이 규칙
- 반드시 제공된 사주 데이터(일간, 신강/신약, 오행 비율, 십신 구성)에 근거해서 말해라.
- 데이터에 없는 내용을 지어내지 마라.
- 이전 풀이(초견, 재물풀이)의 결과가 제공되면, 그 내용과 반드시 일관성을 유지해라.
  - 초견에서의 성정, 재물 성향, 호통 내용과 모순되지 마라.
  - 재물풀이에서의 등급, 그릇, 통로, 누수 패턴과 모순되지 마라.
  - 앞선 풀이를 자연스럽게 이어받아 심화해라.
- 사용자의 질문이 제공되면:
  - 관련 챕터에서 자연스럽게 반영해라.
  - 第十의 '호왕의 밀서'에서 반드시 질문에 직접 답변해라.
  - 명확한 방향을 제시해라. "상황에 따라 다르다" 같은 답 금지.
- 관심 영역이 제공되면 해당 챕터 분량을 다른 챕터보다 1.5배 늘려라.
- 성별 정보에 따라 반드시 해당 성별 시점으로 풀이해라.
  - 남성인 경우: 인연론에서 "아내가 될 사람은~", "여성 중에~" 등 남성 시점으로 서술
  - 여성인 경우: 인연론에서 "남편이 될 사람은~", "남성 중에~" 등 여성 시점으로 서술
  - 이 규칙은 ch5_love, ch5_partner_type에 반드시 적용하고, ch2_personality, ch10_secret 등에서도 일관되게 유지해라.

## 출력 형식
반드시 아래 JSON 형식으로만 응답해라. JSON 외의 텍스트를 절대 포함하지 마라.
{
  "ch1_summary": "명식총론 (600자 내외)",
  "ch1_keyword": "핵심 키워드 1개",
  "ch2_personality": "성정론 (600자 내외)",
  "ch2_strength": "강점 한 줄",
  "ch2_weakness": "약점 한 줄",
  "ch3_wealth": "재물론 (600자 내외)",
  "ch3_grade": "S/A/B/C/D",
  "ch4_career": "관록론 (600자 내외)",
  "ch4_fit_jobs": ["직업1","직업2","직업3"],
  "ch4_career_score": 85,
  "ch5_love": "인연론 (600자 내외)",
  "ch5_partner_type": "이상적 배우자상 한 줄",
  "ch5_love_score": 75,
  "ch6_health": "건강론 (600자 내외)",
  "ch6_weak_organs": ["장기1","장기2"],
  "ch6_health_score": 70,
  "ch7_bigfortune": "대운론 (700자 내외)",
  "ch7_decades": [{"age":0,"score":3,"comment":"요약"},{"age":10,"score":3,"comment":"요약"},{"age":20,"score":4,"comment":"요약"},{"age":30,"score":3,"comment":"요약"},{"age":40,"score":4,"comment":"요약"},{"age":50,"score":5,"comment":"요약"},{"age":60,"score":4,"comment":"요약"},{"age":70,"score":3,"comment":"요약"}],
  "ch8_yearly": "세운론 (600자 내외)",
  "ch8_years": [{"year":"${currentYear}","score":3,"comment":"한줄"},{"year":"${currentYear+1}","score":4,"comment":"한줄"},{"year":"${currentYear+2}","score":3,"comment":"한줄"}],
  "ch9_monthly": "월운론 도입 (200자 내외)",
  "ch9_months": [{"month":1,"score":3,"text":"풀이"},{"month":2,"score":4,"text":"풀이"},{"month":3,"score":3,"text":"풀이"},{"month":4,"score":4,"text":"풀이"},{"month":5,"score":5,"text":"풀이"},{"month":6,"score":3,"text":"풀이"},{"month":7,"score":4,"text":"풀이"},{"month":8,"score":3,"text":"풀이"},{"month":9,"score":4,"text":"풀이"},{"month":10,"score":3,"text":"풀이"},{"month":11,"score":4,"text":"풀이"},{"month":12,"score":3,"text":"풀이"}],
  "ch10_prescription": "종합처방 (500자 내외)",
  "ch10_yongsin": "용신 오행",
  "ch10_direction": "좋은 방향",
  "ch10_color": "좋은 색",
  "ch10_number": "좋은 숫자",
  "ch10_checklist": ["항목1","항목2","항목3","항목4"],
  "ch10_secret": "호왕의 밀서 - 질문 직접 답변 (400자 내외)"
}`;

    // 유저 프롬프트 조립
    const marriage = order.marriage || '미입력';
    const interest = order.interest || '전체';
    const question1 = order.question || '';
    const question2 = order.question2 || '';

    let userPrompt = `## 사주 원국 데이터
- 이름: ${order.user.name}
- 성별: ${gender === 'male' ? '남' : gender === 'female' ? '여' : '미입력'}
- 생년월일: ${solarYear}년 ${solarMonth}월 ${solarDay}일
- 일간(일주 천간): ${dayGan}
- 일간 오행: ${dayOheng}
- 신강/신약: ${strength === 'strong' ? '신강' : '신약'}
- 사주 원국: 년주 ${pillars.year.hanja}(${pillars.year.hangul}) / 월주 ${pillars.month.hanja}(${pillars.month.hangul}) / 일주 ${pillars.day.hanja}(${pillars.day.hangul}) / 시주 ${pillars.hour.hanja}(${pillars.hour.hangul})
- 오행 비율: 목${elementGauge.wood}% 화${elementGauge.fire}% 토${elementGauge.earth}% 금${elementGauge.metal}% 수${elementGauge.water}%
- 십신 구성: ${allSipsin.join(', ')}
- 직업: ${order.job || '미입력'}
- 결혼 여부: ${marriage}
- 관심 영역: ${interest}

## 사용자 질문
- 질문1 (필수): ${question1 || '없음'}
- 질문2 (선택): ${question2 || '없음'}`;

    // 이전 초견 결과 컨텍스트
    if (prevChogyeon) {
      userPrompt += `

## 이전 초견 풀이 결과 (이 내용과 일관성을 반드시 유지해라)
- 일간: ${prevChogyeon.dayGan}, 신강/신약: ${prevChogyeon.strength}
- 성정: ${prevChogyeon.sections?.personality || ''}
- 재물 성향: ${prevChogyeon.sections?.wealth || ''}
- 올해 운: ${prevChogyeon.sections?.yearFortune || ''}
- 호통: ${prevChogyeon.sections?.hoTong || ''}`;
    }

    // 이전 재물풀이 결과 컨텍스트
    if (prevJaemul) {
      userPrompt += `

## 이전 재물풀이 결과 (이 내용과 일관성을 반드시 유지해라)
- 재물등급: ${prevJaemul.wealthGrade}
- 돈 그릇: ${prevJaemul.vesselLabel} (${prevJaemul.vesselSize}%)
- 돈 통로: ${prevJaemul.channelKey}
- 누수 패턴: ${prevJaemul.leakKey} (위험도: ${prevJaemul.leakLabel})
- 재물 총론: ${prevJaemul.sections?.overview || ''}
- 재물 호통: ${prevJaemul.sections?.wealthHoTong || ''}`;
    }

    userPrompt += `

현재 연도는 ${currentYear}년이다. 세운론은 ${currentYear}~${currentYear+2}년, 월운론은 ${currentYear}년 기준으로 작성해라.
위 데이터를 바탕으로 본풀이 10개 챕터를 JSON 형식으로 작성해라.`;

    const claudeRes = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 6000,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt
    }, {
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 300000
    });

    // ── Claude 응답 파싱 ──
    const rawText = claudeRes.data.content[0].text;
    let claude;
    try {
      claude = JSON.parse(rawText);
    } catch (parseErr) {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) claude = JSON.parse(jsonMatch[0]);
      else throw new Error('Claude JSON parse failed');
    }

    // ── 결과 조립 ──
    const resultData = {
      orderId,
      productName: '본풀이',
      userName: order.user.name,
      job: order.job || '',
      marriage,
      interest,
      dayGan,
      dayGanOheng: dayOheng,
      dayElement,
      strength,
      fourPillars: {
        year: pillars.year.hanja, month: pillars.month.hanja,
        day: pillars.day.hanja, hour: pillars.hour.hanja
      },
      fourPillarsHangul: {
        year: pillars.year.hangul, month: pillars.month.hangul,
        day: pillars.day.hangul, hour: pillars.hour.hangul
      },
      elementGauge,
      sections: {
        ch1_summary: claude.ch1_summary,
        ch1_keyword: claude.ch1_keyword,
        ch2_personality: claude.ch2_personality,
        ch2_strength: claude.ch2_strength,
        ch2_weakness: claude.ch2_weakness,
        ch3_wealth: claude.ch3_wealth,
        ch3_grade: claude.ch3_grade,
        ch4_career: claude.ch4_career,
        ch4_fit_jobs: claude.ch4_fit_jobs,
        ch4_career_score: claude.ch4_career_score,
        ch5_love: claude.ch5_love,
        ch5_partner_type: claude.ch5_partner_type,
        ch5_love_score: claude.ch5_love_score,
        ch6_health: claude.ch6_health,
        ch6_weak_organs: claude.ch6_weak_organs,
        ch6_health_score: claude.ch6_health_score,
        ch7_bigfortune: claude.ch7_bigfortune,
        ch7_decades: claude.ch7_decades,
        ch8_yearly: claude.ch8_yearly,
        ch8_years: claude.ch8_years,
        ch9_monthly: claude.ch9_monthly,
        ch9_months: claude.ch9_months,
        ch10_prescription: claude.ch10_prescription,
        ch10_yongsin: claude.ch10_yongsin,
        ch10_direction: claude.ch10_direction,
        ch10_color: claude.ch10_color,
        ch10_number: claude.ch10_number,
        ch10_checklist: claude.ch10_checklist,
        ch10_secret: claude.ch10_secret
      },
      prevChogyeonRef: prevChogyeon ? { dayGan: prevChogyeon.dayGan || '', strength: prevChogyeon.strength || '' } : null,
      prevJaemulRef: prevJaemul ? { wealthGrade: prevJaemul.wealthGrade, vesselLabel: prevJaemul.vesselLabel } : null,
      createdAt: FieldValue.serverTimestamp()
    };

    await db.collection('hw-results').doc(orderId).set(resultData);

  // ── 알림톡: 본풀이 결과 안내 ──
    try {
      const bpURL = 'readmelab.github.io/howangdang/v2/bonpuli-result.html?id=' + orderId;
      await sendAlimtalk(order.user.phone || order.phone, 'KA01TP260321085605954kaAWDuPslLp', {
        '#{이름}': order.user.name || '',
        '#{주문번호}': orderId,
        '#{결과URL}': bpURL
      }, [{ buttonType: 'WL', buttonName: '본풀이 결과 확인하기', linkMo: 'https://' + bpURL, linkPc: 'https://' + bpURL }]);
    } catch(alimErr) { console.error('bonpuri alimtalk error:', alimErr.message); }

    res.json({ success: true, result: resultData });

  } catch (e) {
    console.error('bonpuri error:', e.response?.data || e.message);
    res.status(500).json({ success: false, error: e.response?.data?.error?.message || e.message });
  }
});



// ============ 본풀이 재생성 ============
app.post('/admin/retry-bonpuri', async (req, res) => {
  const { pw, orderId } = req.body;
  if (pw !== '2991') return res.status(403).json({ error: 'forbidden' });
  if (!orderId) return res.status(400).json({ error: 'orderId required' });
  try {
    const axios2 = require('axios');
    await axios2.post(`http://localhost:${process.env.PORT || 8080}/api/bonpuri`, { orderId });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ============ 알림톡 재발송 ============
app.post('/admin/resend-alimtalk', async (req, res) => {
  const { pw, orderId } = req.body;
  if (pw !== '2991') return res.status(403).json({ error: 'forbidden' });
  if (!orderId) return res.status(400).json({ error: 'orderId required' });
  try {
    const orderDoc = await db.collection('hw-orders').doc(orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: 'order not found' });
    const order = orderDoc.data();
    const phone = order.user.phone || order.phone;
    const name = order.user.name || '';
    const product = order.product;
    const pages = { HW1: 'chogyeon-result.html', HW2: 'jaemul-result.html', HW3: 'bonpuli-result.html' };
    const templates = { HW1: 'KA01TP260324060639604xT0jd6AkDxQ', HW2: 'KA01TP2603240607193278WcUpI0NqMM', HW3: 'KA01TP260321085605954kaAWDuPslLp' };
    const btnNames = { HW1: '초견 결과 확인하기', HW2: '재물풀이 결과 확인하기', HW3: '본풀이 결과 확인하기' };
    const resultURL = 'readmelab.github.io/howangdang/' + pages[product] + '?id=' + orderId;
    await sendAlimtalk(phone, templates[product], {
      '#{이름}': name,
      '#{주문번호}': orderId,
      '#{결과URL}': resultURL
    }, [{ buttonType: 'WL', buttonName: btnNames[product], linkMo: 'https://' + resultURL, linkPc: 'https://' + resultURL }]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});



// ============ 알림톡 테스트 ============
app.post('/admin/test-alimtalk', async (req, res) => {
  const { pw, phone } = req.body;
  if (pw !== '2991') return res.status(403).json({ error: 'forbidden' });
  if (!phone) return res.status(400).json({ error: 'phone required' });
  try {
    await sendAlimtalk(phone, 'KA01TP260321085423857M5svGoKweVR', {
      '#{이름}': '테스트',
      '#{상품명}': '테스트 상품',
      '#{주문번호}': 'TEST-' + Date.now(),
      '#{금액}': '0',
      '#{결제일시}': new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
      '#{안내문구}': '이것은 알림톡 테스트입니다.',
      '#{결과URL}': 'readmelab.github.io/howangdang/'
    }, [{ buttonType: 'WL', buttonName: '테스트 확인', linkMo: 'https://readmelab.github.io/howangdang/', linkPc: 'https://readmelab.github.io/howangdang/' }]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ============ 모니터링: 시간별 데이터 ============
app.get('/admin/hourly', async (req, res) => {
  if (req.query.pw !== '2991') return res.status(403).json({ error: 'forbidden' });
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const dates = [yesterday, today];
    const result = {};
    for (const d of dates) {
      const doc = await db.collection('hw-analytics').doc(d).get();
      if (doc.exists) {
        const data = doc.data();
        result[d] = { hourly: data.hourly || {}, cards: data.cards || {}, totalVisits: data.totalVisits || 0, totalCards: data.totalCards || 0 };
      } else {
        result[d] = { hourly: {}, cards: {}, totalVisits: 0, totalCards: 0 };
      }
    }
    const allDocs = await db.collection('hw-analytics').orderBy('date', 'desc').limit(7).get();
    const cardTypes = {};
    allDocs.forEach(doc => {
      const data = doc.data();
      const cards = data.cards || {};
      Object.keys(cards).forEach(k => {
        if (!cardTypes[k]) cardTypes[k] = { today: 0, yesterday: 0, week: 0 };
        cardTypes[k].week += cards[k];
        if (data.date === today) cardTypes[k].today = cards[k];
        if (data.date === yesterday) cardTypes[k].yesterday = cards[k];
      });
    });
    res.json({ success: true, today, yesterday, daily: result, cardTypes });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});



// ============ 트래킹: 페이지 방문 ============
app.post('/api/track/visit', async (req, res) => {
  try {
    const { page, referrer, userAgent } = req.body;
    if (!page) return res.status(400).json({ error: 'page required' });

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD

    const hour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).padStart(2, '0');
    const dailyRef = db.collection('hw-analytics').doc(today);
    await dailyRef.set({
      date: today,
      [`visits.${page}`]: FieldValue.increment(1),
      totalVisits: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await dailyRef.update({
      [`hourly.${hour}.visits`]: FieldValue.increment(1)
    });

    await db.collection('hw-visit-logs').add({
      page,
      referrer: referrer || '',
      userAgent: userAgent || '',
      date: today,
      createdAt: FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (e) {
    console.error('track visit error:', e.message);
    res.json({ success: false });
  }
});

// ============ 트래킹: 호왕패/수호패 생성 ============
app.post('/api/track/card', async (req, res) => {
  try {
    const { type } = req.body;
    if (!type) return res.status(400).json({ error: 'type required' });

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const hour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).padStart(2, '0');
    const dailyRef = db.collection('hw-analytics').doc(today);
    await dailyRef.set({
      date: today,
      totalCards: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await dailyRef.update({
      [`cards.${type}`]: FieldValue.increment(1),
      [`hourly.${hour}.cards`]: FieldValue.increment(1),
      [`hourly.${hour}.cards_${type}`]: FieldValue.increment(1)
    });

    res.json({ success: true });
  } catch (e) {
    console.error('track card error:', e.message);
    res.json({ success: false });
  }
});

// ============ 어드민 대시보드 API ============
app.get('/admin/dashboard', async (req, res) => {
  try {
    if (req.query.pw !== '2991') return res.status(403).json({ success: false, error: 'unauthorized' });

    const now = new Date();
    const period = req.query.period || '7d';
    let startDate;

    if (period === '1d') {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === '7d') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
    } else {
      startDate = new Date('2024-01-01');
    }

    const startDateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

    // 1) 일별 방문/카드 통계
    const dailyOrderMap = {};
    const analyticsSnap = await db.collection('hw-analytics')
      .where('date', '>=', startDateStr)
      .orderBy('date', 'desc')
      .get();

    const dailyStats = [];
    let totalVisits = 0;
    let totalHowangpae = 0;
    let totalSuhopae = 0;
    let totalNusupae = 0;
let totalGimyeongpae = 0;
    const pageVisits = {};

    analyticsSnap.forEach(doc => {
      const d = doc.data();
      const visits = d.visits || {};
      const cards = d.cards || {};

      const dayTotal = d.totalVisits || 0;
      const dayHowangpae = cards.howangpae || 0;
      const daySuhopae = cards.suhopae || 0;
      const dayNusupae = cards.nusupae || 0;
    const dayGimyeongpae = cards.gimyeongpae || 0;

      totalVisits += dayTotal;
      totalHowangpae += dayHowangpae;
      totalSuhopae += daySuhopae;
      totalNusupae += dayNusupae;
      totalGimyeongpae += dayGimyeongpae;

      Object.entries(visits).forEach(([page, count]) => {
        pageVisits[page] = (pageVisits[page] || 0) + count;
      });

      dailyStats.push({
        date: d.date,
        visits: dayTotal,
        howangpae: dayHowangpae,
        suhopae: daySuhopae,
        nusupae: dayNusupae,
        gimyeongpae: dayGimyeongpae,
        cards: dayHowangpae + daySuhopae + dayNusupae + dayGimyeongpae,
        pageBreakdown: visits
      });
    });

    // 2) 결제 완료 주문 통계
    const ordersSnap = await db.collection('hw-orders')
      .where('paymentStatus', '==', 'confirmed')
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    let totalRevenue = 0;
    const productStats = { HW1: { count: 0, revenue: 0 }, HW2: { count: 0, revenue: 0 }, HW3: { count: 0, revenue: 0 }, NUSU: { count: 0, revenue: 0 } };
    const recentOrders = [];
    let upgradeCount = 0;

    ordersSnap.forEach(doc => {
      if (isTestOrder(doc.id, doc.data())) return;
      const d = doc.data();
      const createdAt = d.createdAt ? d.createdAt.toDate() : new Date();
      if (createdAt < startDate) return;

      const price = d.price || 0;
      totalRevenue += price;

      if (productStats[d.product]) {
        productStats[d.product].count += 1;
        productStats[d.product].revenue += price;
      }

      if (d.isUpgrade) upgradeCount++;

      // 일별 주문 집계
      const orderDateStr = createdAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
      if (!dailyOrderMap[orderDateStr]) dailyOrderMap[orderDateStr] = { orders: 0, revenue: 0, upgrades: 0 };
      dailyOrderMap[orderDateStr].orders += 1;
      dailyOrderMap[orderDateStr].revenue += price;
      if (d.isUpgrade) dailyOrderMap[orderDateStr].upgrades += 1;

      if (recentOrders.length < 20) {
        if (isTestOrder(doc.id, d)) return;
        recentOrders.push({
          orderId: d.orderId,
          product: d.product,
          productName: d.productName,
          price: d.price,
          userName: d.user ? d.user.name : '',
          phone: d.user && d.user.phone ? d.user.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3') : '',
          isUpgrade: d.isUpgrade || false,
          status: d.status,
          createdAt: createdAt.toISOString()
        });
      }
    });

    // 3) 전환율
    const totalOrders = productStats.HW1.count + productStats.HW2.count + productStats.HW3.count + productStats.NUSU.count;
    const totalCards = totalHowangpae + totalSuhopae + totalNusupae;


    // dailyStats에 일별 주문 데이터 병합
    dailyStats.forEach(ds => {
      const od = dailyOrderMap[ds.date] || { orders: 0, revenue: 0, upgrades: 0 };
      ds.orders = od.orders;
      ds.revenue = od.revenue;
      ds.upgrades = od.upgrades;
      ds.convVisit = ds.visits > 0 ? Number((od.orders / ds.visits * 100).toFixed(2)) : 0;
      ds.convCard = ds.cards > 0 ? Number((od.orders / ds.cards * 100).toFixed(2)) : 0;
      ds.avgOrderValue = od.orders > 0 ? Math.round(od.revenue / od.orders) : 0;
    });

    const conversionRate = totalVisits > 0 ? (totalOrders / totalVisits * 100).toFixed(2) : '0.00';
    const cardToPayRate = totalCards > 0 ? (totalOrders / totalCards * 100).toFixed(2) : '0.00';
    const upgradeRate = (productStats.HW1.count + productStats.HW2.count) > 0
      ? (upgradeCount / (productStats.HW1.count + productStats.HW2.count) * 100).toFixed(2) : '0.00';

    res.json({
      success: true,
      period,
      summary: {
        totalVisits,
        totalHowangpae,
        totalSuhopae,
        totalNusupae,
        totalGimyeongpae,
        totalCards,
        totalOrders,
        totalRevenue,
        upgradeCount,
        conversionRate: conversionRate + '%',
        cardToPayRate: cardToPayRate + '%',
        upgradeRate: upgradeRate + '%',
        avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0
      },
      productStats,
      pageVisits,
      dailyStats,
      recentOrders
    });

  } catch (e) {
    console.error('dashboard error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});



// ============ 관리자: 성별 업데이트 ============
app.post('/admin/update-gender', async (req, res) => {
  const { pw, orderId, gender } = req.body;
  if (pw !== '2991') return res.status(403).json({ success: false });
  if (!orderId || !gender) return res.status(400).json({ success: false, error: 'orderId and gender required' });
  try {
    await db.collection('hw-orders').doc(orderId).update({ 'user.gender': gender });
    res.json({ success: true, message: orderId + ' gender -> ' + gender });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
app.post('/admin/reset-ask', async (req, res) => {
  const { pw, orderId } = req.body;
  if (pw !== '2991') return res.status(403).json({ success: false });
  try {
    await db.collection('hw-orders').doc(orderId).update({
      askCount: 0,
      questions: admin.firestore.FieldValue.delete()
    });
    res.json({ success: true, message: 'askCount 초기화 완료' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});


// =============================================================
// V2 - 무료 누수패
// =============================================================
app.post('/api/v2/nusu-card', async (req, res) => {
  try {
    const { name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute, calendarType } = req.body;
    if (!birthYear || !birthMonth || !birthDay) return res.status(400).json({ success: false, error: 'birth date required' });

    const gv = normalizeGender(gender) === 'female' ? 'female' : 'male';
    let solarYear = Number(birthYear);
    let solarMonth = Number(birthMonth);
    let solarDay = Number(birthDay);

    if (calendarType === 'lunar') {
      const cal = new KoreanLunarCalendar();
      cal.setLunarDate(Number(birthYear), Number(birthMonth), Number(birthDay), false);
      const sol = cal.getSolarCalendar();
      solarYear = sol.year; solarMonth = sol.month; solarDay = sol.day;
    }

    const sajuRes = await axios.post('https://naread-saju-1075269376260.asia-northeast3.run.app/saju', {
      name: name || 'nusu', year: solarYear, month: solarMonth, day: solarDay,
      hour: (birthHour !== undefined && birthHour !== null) ? Number(birthHour) : 12,
      minute: (birthMinute !== undefined && birthMinute !== null) ? Number(birthMinute) : 0,
      gender: gv === 'male' ? '\uB0A8' : '\uC5EC', calendarType: 'solar'
    });
    const saju = sajuRes.data.data;
    const dayGan = saju.dayMaster.gan;
    const dayOheng = saju.dayMaster.oheng;
    const ohengMap = { '\uBAA9': 'wood', '\uD654': 'fire', '\uD1A0': 'earth', '\uAE08': 'metal', '\uC218': 'water' };
    const dayElement = ohengMap[dayOheng] || 'wood';

    const oh = saju.oheng;
    const total = (oh['\uBAA9']||0) + (oh['\uD654']||0) + (oh['\uD1A0']||0) + (oh['\uAE08']||0) + (oh['\uC218']||0);
    const dayPct = total ? Math.round(((oh[dayOheng]||0) / total) * 100) : 0;
    const strength = dayPct >= 25 ? 'strong' : 'weak';
    const elementGauge = {
      wood: total ? Math.round(((oh['\uBAA9']||0)/total)*100) : 0,
      fire: total ? Math.round(((oh['\uD654']||0)/total)*100) : 0,
      earth: total ? Math.round(((oh['\uD1A0']||0)/total)*100) : 0,
      metal: total ? Math.round(((oh['\uAE08']||0)/total)*100) : 0,
      water: total ? Math.round(((oh['\uC218']||0)/total)*100) : 0
    };

    const sipseong = saju.sipseong || {};
    const allSipsin = [];
    ['year','month','day','hour'].forEach(p => {
      if (sipseong[p]) {
        if (sipseong[p].gan && sipseong[p].gan !== '\uC77C\uAC04') allSipsin.push(sipseong[p].gan);
        if (sipseong[p].ji) sipseong[p].ji.forEach(j => { if (j.sipseong) allSipsin.push(j.sipseong); });
      }
    });
    const gwansungCount = allSipsin.filter(s => s && (s.includes('\uC815\uAD00') || s.includes('\uD3B8\uAD00'))).length;
    const siksangCount = allSipsin.filter(s => s && (s.includes('\uC2DD\uC2E0') || s.includes('\uC0C1\uAD00'))).length;
    const insungCount = allSipsin.filter(s => s && (s.includes('\uC815\uC778') || s.includes('\uD3B8\uC778'))).length;
    const jaeCount = allSipsin.filter(s => s && (s.includes('\uC815\uC7AC') || s.includes('\uD3B8\uC7AC'))).length;
    const bigyeopCount = allSipsin.filter(s => s && (s.includes('\uBE44\uACAC') || s.includes('\uACA9\uC7AC'))).length;

    let leakKey = 'unconscious';
    const leakScores = {
      people: bigyeopCount >= 3 ? bigyeopCount * 2 : bigyeopCount,
      desire: siksangCount >= 3 ? siksangCount * 2 : siksangCount,
      pride: gwansungCount >= 3 ? gwansungCount * 2 : gwansungCount,
      learning: insungCount >= 3 ? insungCount * 2 : insungCount
    };
    const maxLeak = Object.entries(leakScores).sort((a,b) => b[1] - a[1])[0];
    const topScore = maxLeak[1];
    if (topScore >= 4) leakKey = maxLeak[0];

    const totalPressure = Object.values(leakScores).reduce((a,b) => a+b, 0);
    const defense = Math.min(jaeCount * 2, 6);
    const finalLeakScore = Math.max(0, topScore + Math.floor(totalPressure / 4) - defense);
    let leakLevel;
    if (finalLeakScore <= 1) leakLevel = 1;
    else if (finalLeakScore <= 4) leakLevel = 2;
    else if (finalLeakScore <= 7) leakLevel = 3;
    else if (finalLeakScore <= 10) leakLevel = 4;
    else leakLevel = 5;

    const birthDateStr = solarYear + '-' + String(solarMonth).padStart(2,'0') + '-' + String(solarDay).padStart(2,'0');
    const age = ageData.calcAge(birthDateStr);
    const ageGroup = ageData.getAgeGroup(age);
    const leakAmount = ageData.calcLeakAmount(age, leakLevel);

    const ganHangulMap = { '\u7532':'\uAC11', '\u4E59':'\uC744', '\u4E19':'\uBCD1', '\u4E01':'\uC815', '\u620A':'\uBB34', '\u5DF1':'\uAE30', '\u5E9A':'\uACBD', '\u8F9B':'\uC2E0', '\u58EC':'\uC784', '\u7678':'\uACC4' };
    const ganKey = ganHangulMap[dayGan] || '\uAC11';
    const strengthKey = strength === 'strong' ? 'strong' : 'weak';

    const cardBase = nusuData.card_base[leakKey] || '';
    const cardTail = nusuData.card_tail[ganKey + '_' + strengthKey] || '';
    const cardText = cardBase + ' ' + cardTail;

    const fourPillars = {
      year: saju.fourPillars.year.hanja,
      month: saju.fourPillars.month.hanja,
      day: saju.fourPillars.day.hanja,
      hour: saju.fourPillars.hour.hanja
    };
    const fourPillarsHangul = {
      year: saju.fourPillars.year.hangul,
      month: saju.fourPillars.month.hangul,
      day: saju.fourPillars.day.hangul,
      hour: saju.fourPillars.hour.hangul
    };

    res.json({
      success: true,
      card: {
        name: name || '',
        gender: gv,
        age: age,
        ageGroup: ageGroup,
        ageLabel: ageData.groups[ageGroup].label,
        dayGan: dayGan,
        dayGanOheng: dayElement,
        strength: strength,
        fourPillars: fourPillars,
        fourPillarsHangul: fourPillarsHangul,
        elementGauge: elementGauge,
        leakKey: leakKey,
        leakLevel: leakLevel,
        leakLabel: nusuData.levelLabel[leakLevel],
        leakDesc: nusuData.levelDesc[leakLevel],
        leakScores: leakScores,
        leakAmount: leakAmount,
        cardText: cardText
      }
    });
  } catch (e) {
    console.error('nusu-card error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================
// V2 - 누수처방 (9,900원 유료)
// =============================================================
app.post('/api/v2/nusu-treat', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' });

    const orderDoc = await db.collection('hw-orders').doc(orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ success: false, error: 'order not found' });
    const order = orderDoc.data();
    if (order.product !== 'NUSU') return res.status(400).json({ success: false, error: 'not NUSU order, skip nusu-treat' });

    const cardData = order.nusuCard;
    if (!cardData) return res.status(400).json({ success: false, error: 'nusu card data not found' });

    const leakKey = cardData.leakKey;
    const leakLevel = cardData.leakLevel;
    const dayGan = cardData.dayGan;
    const dayGanOheng = cardData.dayGanOheng;
    const strength = cardData.strength;
    const age = cardData.age;
    const ageGroup = cardData.ageGroup;

    const jobKey = jobData.getJobKey(order.job || '\uC9C1\uC7A5\uC778');
    const lifeKey = lifeData.getLifeKey(order.marriage || '\uBBF8\uD63C', order.hasChild || '\uC5C6\uC74C');
    const genderShort = (order.user && (order.user.gender === 'female' || order.user.gender === 'f')) ? 'female' : 'male';

    const ganHangulMap = { '\u7532':'\uAC11', '\u4E59':'\uC744', '\u4E19':'\uBCD1', '\u4E01':'\uC815', '\u620A':'\uBB34', '\u5DF1':'\uAE30', '\u5E9A':'\uACBD', '\u8F9B':'\uC2E0', '\u58EC':'\uC784', '\u7678':'\uACC4' };
    const ganKey = ganHangulMap[dayGan] || '\uAC11';
    const strengthKey = strength === 'strong' ? 'strong' : 'weak';

    const leakAmount = ageData.calcLeakAmount(age, leakLevel);

    var ch1 = (nusuData.ch1_base[leakKey] || '') + ' ' + (nusuData.ch1_tail[ganKey + '_' + strengthKey] || '');

    var ch2 = (nusuData.ch2_base[leakKey] || '') + ' ' + (nusuData.ch2_oheng[dayGanOheng] || '') + ' ' + (nusuData.ch2_level[leakLevel] || '');

    var ch3 = (nusuData.ch3_base[leakKey] || '') + ' ' + (nusuData.ch3_gender[leakKey + '_' + genderShort] || '') + ' ' + (nusuData.ch3_age[leakKey + '_age_' + ageGroup] || '') + ' ' + (nusuData.ch3_job[leakKey + '_' + jobKey] || '') + ' ' + (nusuData.ch3_life[leakKey + '_' + lifeKey] || '');

    var ch4 = (nusuData.ch4_base[leakKey] || '') + ' ' + (nusuData.ch4_strength[strengthKey] || '') + ' ' + (nusuData.ch4_oheng[dayGanOheng] || '') + ' ' + (nusuData.ch4_gender[genderShort] || '');

    var dayGanCalendar = nusuData.ch5_dayGan[ganKey] || nusuData.ch5_dayGan['\uAC11'];
    var ch5 = {
      danger: dayGanCalendar.danger,
      safe: dayGanCalendar.safe,
      tip: dayGanCalendar.tip,
      leakTip: nusuData.ch5_leakKey[leakKey] || '',
      jobTip: nusuData.ch5_job[jobKey] || ''
    };

    var ch6 = (nusuData.ch6_base[leakKey] || '') + ' ' + (nusuData.ch6_gender[leakKey + '_' + genderShort] || '') + ' ' + (nusuData.ch6_age['age_' + ageGroup] || '') + ' ' + (nusuData.ch6_job[leakKey + '_' + jobKey] || '') + ' ' + (nusuData.ch6_life[leakKey + '_' + lifeKey] || '') + ' ' + (nusuData.ch6_strength[strengthKey] || '');

    var ch7 = (nusuData.ch7_oheng[dayGanOheng] || '') + ' ' + (nusuData.ch7_age['age_' + ageGroup] || '');

    await db.collection('hw-results').doc(orderId).set({
      orderId, productName: '누수처방', userName: order.user.name || '',
      leakKey, leakLevel, leakAmount, dayGan, dayGanOheng, strength, age, ageGroup,
      jobKey, lifeKey, genderKey: genderShort,
      leakLabel: nusuData.levelLabel[leakLevel],
      chapters: { ch1, ch2, ch3, ch4, ch5, ch6, ch7 },
      nusuCard: cardData,
     fourPillars: cardData.fourPillars || null,
     fourPillarsHangul: cardData.fourPillarsHangul || null,
     elementGauge: cardData.elementGauge || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('hw-orders').doc(orderId).update({
      nusuTreat: {
        leakKey: leakKey,
        leakLevel: leakLevel,
        dayGan: dayGan,
        dayGanOheng: dayGanOheng,
        strength: strength,
        age: age,
        ageGroup: ageGroup,
        jobKey: jobKey,
        lifeKey: lifeKey,
        genderKey: genderShort,
        leakAmount: leakAmount,
        chapters: { ch1: ch1, ch2: ch2, ch3: ch3, ch4: ch4, ch5: ch5, ch6: ch6, ch7: ch7 },
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }
    });

    res.json({
      success: true,
      result: {
        leakKey: leakKey,
        leakLevel: leakLevel,
        leakAmount: leakAmount,
        leakLabel: nusuData.levelLabel[leakLevel],
        chapters: { ch1: ch1, ch2: ch2, ch3: ch3, ch4: ch4, ch5: ch5, ch6: ch6, ch7: ch7 }
      }
    });
  } catch (e) {
    console.error('nusu-treat error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============ 테스트 데이터 정리 API ============
app.delete('/admin/cleanup-test', async (req, res) => {
  try {
    const snapshot = await db.collection('hw-orders').get();
    const testPrefixes = ['stage', 'test', 'final-test', 'tail-test', 'nusu-t', 'jaemul-t', 'su-t', 'ul-t', 'jobseeker-test', 'fix-test', 'life-test', 'jaemul-refactor', 'nusu-life', 'nusu-var', 'nusu-full', 'nusu-upsell', 'nusu-flow'];
    const batch = db.batch();
    let count = 0;
    snapshot.forEach(doc => {
      const id = doc.id;
      const isTest = testPrefixes.some(p => id.startsWith(p));
      const isTestPhone = doc.data()?.user?.phone === '010-0000-0000';
      if (isTest || isTestPhone) {
        batch.delete(doc.ref);
        count++;
      }
    });
    await batch.commit();
    res.json({ success: true, deleted: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ 테스트 주문 필터 함수 ============
function isTestOrder(docId, data) {
  const testPrefixes = ['stage', 'test', 'final-test', 'tail-test', 'nusu-t', 'jaemul-t', 'su-t', 'ul-t', 'jobseeker-test', 'fix-test', 'life-test', 'jaemul-refactor', 'nusu-life', 'nusu-var', 'nusu-full', 'nusu-upsell', 'nusu-flow'];
  if (testPrefixes.some(p => docId.startsWith(p))) return true;
  if (data?.user?.phone === '010-0000-0000') return true;
  return false;
}

app.listen(PORT, () => console.log('hw-server running on port ' + PORT));



