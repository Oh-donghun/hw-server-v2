const { SolapiMessageService } = require('solapi');
const solapi = new SolapiMessageService('NCSUJBVRQTLH6AO6', 'RMJ3JKB41HY4DFXJXKTML8MFYGFXXZDL');
const SOLAPI_PFID = 'KA01PF260321085123459F9a9qgYI1Jx';
const SOLAPI_SENDER = '01098471152';

async function sendAlimtalk(phone, templateId, variables, buttons) {
  try {
    const msg = {
      to: phone.replace(/-/g, ''),
      from: SOLAPI_SENDER,
      kakaoOptions: {
        pfId: SOLAPI_PFID,
        templateId: templateId,
        variables: variables,
        buttons: buttons || []
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

module.exports = { sendAlimtalk, SOLAPI_PFID, SOLAPI_SENDER };
