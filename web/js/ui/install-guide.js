// 카카오톡 안의 브라우저로 열렸을 때: 앱 설치가 안 되므로 Chrome으로 열도록 안내
// kakaotalk://web/openExternal 방식은 실제 안드로이드 폰에서 동작 확인 필요 (SPEC 11장 5번)
const $ = (id) => document.getElementById(id);

export const isKakaoInApp = () => /KAKAOTALK/i.test(navigator.userAgent);

// onStay: "그냥 여기서 할게요"를 눌렀을 때 (초대 링크 처리 등 계속 진행)
export function showKakaoGuide(onStay) {
  $('kakao').hidden = false;
  $('btnOpenChrome').onclick = () => {
    location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`;
  };
  $('btnStayKakao').onclick = () => {
    $('kakao').hidden = true;
    if (onStay) onStay();
  };
}
