# hw-server-v2 아키텍처

## 서비스 개요
- **사업**: 호왕당 v2 (누수패 기반 결제 서버)
- **Cloud Run**: hw-server-v2 (asia-northeast3)
- **URL**: https://hw-server-v2-svwkzchhha-du.a.run.app

## 기술 스택
- Node.js (CommonJS), Express
- Firebase Firestore (ADC 인증)
- Toss Payments, Solapi 카카오 알림톡

## 주요 엔드포인트
- POST /api/jaemul — 주문 조회 (orderId 기반)

## 환경변수 (GitHub Secrets)
- TOSS_SECRET_KEY
- SOLAPI_API_KEY / SOLAPI_API_SECRET
- SOLAPI_PFID (호왕당 채널: KA01PF260321085123459F9a9qgYI1Jx)
- SOLAPI_SENDER
- CLAUDE_API_KEY
- GCP_SA_KEY

## 인증 방식
- Firebase: ADC (Application Default Credentials)
- serviceAccount.json 미사용, .gitignore 처리

## 배포
- GitHub Actions → Cloud Run 자동 배포
- 브랜치: main push시 트리거