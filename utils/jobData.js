function getJobKey(job) {
  const map = {
    '직장인':  'office',
    '사무직':  'office',
    '자영업':  'business',
    '프리랜서':'freelance',
    '학생':    'student',
    '취준생':  'jobseeker',
    '무직':    'jobseeker',
    '주부':    'homemaker',
    '공무원':  'public',
    '은퇴':    'retired',
    '현장직':  'technical'
  };
  return map[job] || 'office';
}
module.exports = { getJobKey };