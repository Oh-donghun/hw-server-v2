function normalizeGender(raw) {
  if (!raw || raw === '') return 'female';
  const v = String(raw).trim().toLowerCase();
  if (['male','m'].includes(v)) return 'male';
  if (['female','f'].includes(v)) return 'female';
  if (v === '남') return 'male';
  if (v === '여') return 'female';
  return 'female';
}

module.exports = { normalizeGender };