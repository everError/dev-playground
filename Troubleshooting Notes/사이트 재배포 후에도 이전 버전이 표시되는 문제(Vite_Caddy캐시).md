## Environment

- Frontend Build: Vite
- Web Server: Caddy
- 정적 파일 서빙 구조 (SPA)

## Symptom

사이트 코드를 수정하고 재배포한 뒤 브라우저(또는 WebView)에서 다시 접속해도 이전 버전의 사이트가 그대로 표시됨.

## Cause

브라우저는 서버에서 받은 리소스를 로컬 디스크에 캐시한다. 별도의 캐시 정책이 없으면 서버에서 재배포하더라도 클라이언트가 캐시된 이전 파일을 그대로 사용하기 때문에 변경 사항이 반영되지 않는다.

## Solution

Vite는 빌드 시 JS/CSS 파일명에 콘텐츠 해시를 자동으로 붙인다 (`app-3a8f2c.js`, `style-b4d1e7.css`). 파일 내용이 바뀌면 해시도 달라져서 파일명 자체가 변경된다. 이 특성을 이용해 `index.html`과 정적 파일의 캐시 정책을 분리한다.

**index.html → `Cache-Control: no-cache`**

캐시를 아예 사용하지 않는다는 뜻이 아니다. 클라이언트가 캐시를 저장하되, 매 요청마다 서버에 "내가 가진 버전이 아직 유효한가?"를 확인(ETag 기반 검증)하라는 의미다. 변경이 없으면 본문 없이 304 Not Modified만 응답하므로 속도 저하가 거의 없고, 변경됐으면 새 HTML을 내려준다.

**assets/\* → `Cache-Control: public, max-age=31536000, immutable`**

해시가 포함된 파일명은 내용이 바뀌면 아예 다른 URL이 되므로, 1년짜리 장기 캐시를 걸어도 안전하다. immutable은 이 리소스가 절대 변경되지 않으니 유효성 재검증도 하지 말라는 의미다.

**재배포 시 동작 흐름**

1. 클라이언트가 index.html을 요청한다
2. no-cache 정책에 따라 서버에 변경 여부를 확인한다
3. 재배포로 HTML이 바뀌었으면 새 index.html을 받는다 (200 OK)
4. 새 HTML 안에 새 해시 파일명이 적혀있다
5. 해당 파일은 캐시에 없으므로 서버에서 새로 받는다
6. 재배포하지 않았으면 3단계에서 304를 받고 기존 캐시를 그대로 사용한다

**Caddy 설정**

```
handle /app* {
    root * /var/www/html
    try_files {path} {path}/ /app/index.html

    @html path */index.html /app/ /app
    header @html Cache-Control "no-cache"

    @assets path /app/assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"

    file_server
}
```

SPA 경로가 여러 개인 경우 각 handle 블록마다 matcher 이름을 다르게 지정해야 한다. Caddy는 같은 스코프 내에서 matcher 이름 중복을 허용하지 않는다.

## Notes

- 이전 해시 파일은 클라이언트 캐시에 남아있지만, 브라우저가 LRU 방식으로 자동 정리하므로 별도 관리 불필요
- 이 전략은 Caddy뿐 아니라 Nginx 등 다른 웹서버에서도 동일하게 적용 가능 (헤더 설정 문법만 다름)
