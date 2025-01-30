# error:0308010C - Digital Envelope Routines Unsupported 오류 해결

## 오류 내용

### 오류 메시지

```
error:0308010C:digital envelope routines::unsupported
```

## 원인

이 오류는 최신 버전의 OpenSSL에서 일부 암호화 기능이 지원되지 않기 때문에 발생합니다. 보통 Node.js 17 이상에서 발생하며, Webpack 등의 빌드 도구와 충돌할 수 있습니다.

## 해결 방법

### 1. `react-scripts` 버전 다운그레이드

해당 오류는 `react-scripts`의 최신 버전과 Node.js의 호환성 문제로 인해 발생할 수 있습니다. 이를 해결하기 위해 `react-scripts` 버전을 `5.0.0`으로 고정합니다.

```bash
npm install --save --save-exact react-scripts@5.0.0
```

### 2. 환경 변수 설정 (대체 방법)

만약 위 방법으로 해결되지 않는다면, OpenSSL의 레거시 프로토콜을 활성화하는 환경 변수를 설정할 수도 있습니다.

```bash
export NODE_OPTIONS=--openssl-legacy-provider
```

또는 Windows의 경우:

```cmd
set NODE_OPTIONS=--openssl-legacy-provider
```

## 결론

위 방법 중 `react-scripts` 버전을 5.0.0으로 고정하는 방식이 가장 안정적인 해결책입니다. 추가적으로 환경 변수를 설정하여 문제를 해결할 수도 있습니다.
