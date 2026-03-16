**Title:** Nginx 실행 시 localhost 충돌로 인한 Ocelot 게이트웨이 응답 지연

**Category:** Network

**Stack:** Nginx, .NET, Ocelot

**Status:** Resolved

**Priority:** High

---

## Environment

- OS: Windows
- API Gateway: Ocelot (.NET Kestrel)
- Reverse Proxy: Nginx
- 게이트웨이 서비스: http://localhost:7020
- 하위 서비스: http://localhost:7021
- 로컬 개발 환경에서 Nginx와 Ocelot을 동시에 실행하는 구조

## Symptom

Ocelot 게이트웨이를 통해 Swagger UI에서 하위 서비스로 요청을 보낼 때, Nginx가 실행 중이면 게이트웨이 자체에 직접 접근해도 응답이 수 초 이상 지연된다. Nginx를 중지하면 즉시 정상 속도로 돌아온다. 하위 서비스 자체에는 문제가 없고, Nginx 존재 여부만으로 증상이 재현된다.

## Cause

Windows에서 `localhost`는 단순히 `127.0.0.1`로 해석되지 않는다. OS가 DNS를 조회하면서 IPv6(`::1`)과 IPv4(`127.0.0.1`)를 모두 시도하는데, 이 과정에서 문제가 발생한다.

**localhost의 이중 해석 문제**

Windows의 DNS resolver는 `localhost`를 요청하면 `::1`(IPv6)을 먼저 시도하고, 실패하면 `127.0.0.1`(IPv4)로 폴백한다. Nginx가 꺼져있을 때는 이 과정이 빠르게 실패하고 넘어가지만, Nginx가 실행 중이면 상황이 달라진다.

**Nginx가 loopback 인터페이스를 점유**

Nginx가 `localhost`(또는 `0.0.0.0`)로 리슨하고 있으면 IPv6/IPv4 양쪽 모두에서 커넥션을 받을 수 있는 상태가 된다. Ocelot의 내부 HttpClient가 하위 서비스에 요청을 보낼 때 `localhost`를 사용하면, DNS 조회 → IPv6 시도 → 타임아웃 또는 경합 → IPv4 폴백이라는 불필요한 과정을 거치게 된다.

**커넥션 경합**

Ocelot과 Nginx가 동일한 loopback 주소 공간에서 동시에 커넥션을 열고 닫으면서, TCP 소켓 레벨에서 리소스 경합이 발생한다. 특히 Ocelot 내부의 HttpClient는 요청마다 DNS를 다시 조회할 수 있어서, 매 요청마다 위 지연이 반복된다.

결과적으로 Nginx 자체가 트래픽을 가로채는 것이 아니라, `localhost`라는 주소의 모호성이 다중 프로세스 환경에서 병목을 만드는 것이 근본 원인이다.

## Solution

**1. 모든 내부 통신 주소를 `localhost` → `127.0.0.1`로 변경**

`127.0.0.1`은 DNS 조회 없이 IPv4 loopback으로 직접 연결되므로, IPv6 시도와 DNS 오버헤드가 완전히 제거된다.

Ocelot 라우팅 설정 (`ocelot.json`):

```json
"DownstreamHostAndPorts": [
  { "Host": "127.0.0.1", "Port": 7021 }
]
```

Swagger 서버 설정:

```json
"servers": [
  { "url": "http://127.0.0.1:7021" }
]
```

Kestrel 바인딩도 명시적으로 지정:

```csharp
webBuilder.UseUrls("http://127.0.0.1:7020");
```

**2. Nginx worker 프로세스 제한**

로컬 개발 환경에서는 worker를 1개로 제한하여 loopback 리소스 점유를 최소화한다.

```nginx
worker_processes 1;
```

## Notes

- 이 문제는 Windows 로컬 개발 환경 특유의 이슈로, Linux에서는 `localhost`가 거의 항상 `127.0.0.1`로 즉시 해석되어 재현되지 않을 수 있다
- Docker 환경에서는 컨테이너 간 통신이 Docker 네트워크를 통하므로 해당 문제가 발생하지 않는다
- 로컬 개발뿐 아니라 운영 환경에서도 서비스 간 내부 통신에는 `localhost` 대신 명시적 IP를 사용하는 것이 권장된다
