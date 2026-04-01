// 텍스트 키 조합 엔진
// 데이터 파일에서 base + tail 패턴으로 텍스트를 조립

/**
 * buildText(dataObj, keys)
 *
 * dataObj: { base: {key: text}, gender: {key_gender: text}, age: {key_age: text}, ... }
 * keys: { main: 'pride', gender: 'male', age: 'age_35_39', job: 'office', life: 'single' }
 *
 * 결과: base[main] + gender[main+'_'+gender] + age[main+'_'+age] + ...
 */
function buildText(sections, mainKey, context) {
  let result = '';

  // sections 배열: [{data, prefix, contextKey}]
  // 예: [{data: nusuData.ch3_base, prefix: '', contextKey: null},
  //      {data: nusuData.ch3_gender, prefix: '', contextKey: 'gender'},
  //      {data: nusuData.ch3_age, prefix: '', contextKey: 'age'}]
  sections.forEach(sec => {
    let key;
    if (!sec.contextKey) {
      key = mainKey;
    } else {
      const ctxVal = context[sec.contextKey];
      if (!ctxVal) return;
      key = (sec.useMainPrefix !== false) ? mainKey + '_' + ctxVal : ctxVal;
    }
    const text = sec.data[key] || '';
    if (text) result += (result ? ' ' : '') + text;
  });

  return result;
}

/**
 * appendTail(baseText, tailData, compositeKey)
 * 기존 텍스트에 꼬리 텍스트를 추가
 */
function appendTail(baseText, tailData, compositeKey) {
  if (!tailData || !compositeKey) return baseText;
  const tail = tailData[compositeKey] || '';
  return tail ? baseText + ' ' + tail : baseText;
}

module.exports = { buildText, appendTail };
