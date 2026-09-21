// Buffer <-> base64 text 변환 헬퍼. DB에는 bytea 대신 일반 text(base64)로 저장해서
// PostgREST의 bytea hex-literal 인코딩을 신경 쓸 필요가 없게 한다.
function toBase64(bufferLike) {
  return Buffer.from(bufferLike).toString('base64');
}

function fromBase64(value) {
  if (!value) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(String(value), 'base64');
}

module.exports = { toBase64, fromBase64 };
