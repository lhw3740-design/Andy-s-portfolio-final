function getWebAuthnConfig() {
  const rpID = process.env.RP_ID;
  const rpName = process.env.RP_NAME || 'Andy Portfolio';
  const originEnv = process.env.ORIGIN;
  if (!rpID || !originEnv) {
    throw new Error('RP_ID / ORIGIN 환경변수가 설정되지 않았습니다.');
  }
  const origins = originEnv.split(',').map((s) => s.trim()).filter(Boolean);
  return { rpID, rpName, origins };
}

module.exports = { getWebAuthnConfig };
