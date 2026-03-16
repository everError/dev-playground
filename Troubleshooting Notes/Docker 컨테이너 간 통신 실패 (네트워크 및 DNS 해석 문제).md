**Title:** Docker 컨테이너 간 통신 실패 (네트워크 및 DNS 해석 문제)

**Category:** Infra

**Stack:** Docker

**Status:** Resolved

**Priority:** High

---

## Environment

- Docker / Docker Compose
- 여러 컨테이너(API 서버, DB, 리버스 프록시 등)가 함께 구동되는 구조

## Symptom

docker-compose로 여러 서비스를 띄운 뒤, 한 컨테이너에서 다른 컨테이너로 접근하면 연결이 실패한다. 에러 메시지는 상황에 따라 다르게 나타난다.

```
// 서비스명으로 호출 시
Name or service not known
getaddrinfo failed: Name does not resolve

// IP로 직접 호출 시
Connection refused
No route to host
```

호스트 머신에서 `localhost:포트`로 접근하면 정상인데, 컨테이너 내부에서 다른 컨테이너로 접근할 때만 실패한다.

## Cause

Docker 컨테이너는 각각 독립된 네트워크 네임스페이스를 가진다. 컨테이너 간 통신이 되려면 같은 Docker 네트워크에 속해 있어야 하고, 서비스명 기반 DNS 해석이 동작해야 한다. 이 조건이 갖춰지지 않으면 통신이 실패한다.

**원인 1. 컨테이너가 서로 다른 네트워크에 있다**

```yaml
# docker-compose.yml에서 네트워크를 명시하지 않은 경우
# docker-compose는 기본적으로 프로젝트명_default 네트워크를 생성한다
# 하지만 별도 docker run으로 띄운 컨테이너는 이 네트워크에 속하지 않는다
```

`docker run`으로 개별 실행한 컨테이너는 기본 bridge 네트워크에 속하고, docker-compose로 띄운 컨테이너는 별도의 프로젝트 네트워크에 속한다. 서로 다른 네트워크에 있으면 통신 자체가 불가능하다.

**원인 2. localhost나 127.0.0.1로 다른 컨테이너에 접근한다**

```csharp
// 컨테이너 내부에서 이렇게 설정하면 실패
"ConnectionString": "Server=localhost;Database=mydb;..."
```

컨테이너 안에서 `localhost`는 자기 자신의 컨테이너를 가리킨다. 다른 컨테이너의 DB에 접근하려면 해당 컨테이너의 서비스명이나 컨테이너명을 사용해야 한다.

**원인 3. 기본 bridge 네트워크에서 서비스명 DNS가 동작하지 않는다**

```bash
# docker run으로 각각 실행
docker run --name api-server my-api
docker run --name db-server postgres
# api-server에서 'db-server'로 접근 → DNS 해석 실패
```

Docker의 기본 bridge 네트워크는 서비스명 기반 DNS 해석을 지원하지 않는다. 컨테이너명으로 통신하려면 사용자 정의 네트워크(user-defined network)를 만들어야 한다. docker-compose는 자동으로 사용자 정의 네트워크를 생성하기 때문에 compose 안에서는 서비스명 DNS가 동작한다.

**원인 4. 컨테이너 내부 포트와 호스트 매핑 포트를 혼동한다**

```yaml
services:
  db:
    image: postgres
    ports:
      - "5433:5432" # 호스트 5433 → 컨테이너 5432
```

호스트에서는 `localhost:5433`으로 접근하지만, 다른 컨테이너에서는 `db:5432`로 접근해야 한다. `ports` 매핑은 호스트와 컨테이너 사이의 포트 매핑이지, 컨테이너 간 통신과는 무관하다. 컨테이너 간에는 항상 내부 포트를 사용한다.

## Solution

**1. docker-compose에서 같은 네트워크에 묶는다 (기본)**

```yaml
version: "3.8"

services:
  api:
    build: ./api
    networks:
      - app-network
    depends_on:
      - db
    environment:
      # localhost가 아니라 서비스명으로 접근
      - ConnectionStrings__Default=Server=db;Port=5432;Database=mydb;...

  db:
    image: postgres:16
    networks:
      - app-network
    # ports는 호스트에서 접근할 때만 필요
    # 컨테이너 간 통신에는 불필요
    ports:
      - "5433:5432"

  caddy:
    image: caddy:2
    networks:
      - app-network
    ports:
      - "80:80"
      - "443:443"

networks:
  app-network:
    driver: bridge
```

모든 서비스를 같은 네트워크에 명시적으로 넣고, 서비스 간 통신은 서비스명 + 내부 포트로 설정한다.

**2. 서비스 간 통신 주소 규칙을 정리한다**

| 접근 위치         | 접근 대상    | 주소             |
| ----------------- | ------------ | ---------------- |
| 호스트 → DB       | PostgreSQL   | `localhost:5433` |
| API 컨테이너 → DB | PostgreSQL   | `db:5432`        |
| Caddy → API       | .NET Kestrel | `api:80`         |
| 호스트 → API      | Caddy 경유   | `localhost:80`   |

핵심은 호스트에서 접근할 때는 매핑된 포트, 컨테이너 간 접근할 때는 서비스명 + 내부 포트라는 것이다.

**3. docker run으로 개별 컨테이너를 띄울 때는 네트워크를 지정한다**

```bash
# 네트워크 생성
docker network create app-network

# 같은 네트워크에 붙여서 실행
docker run --name db-server --network app-network postgres:16
docker run --name api-server --network app-network my-api
```

이렇게 하면 `api-server`에서 `db-server`라는 이름으로 DNS 해석이 가능하다.

**4. 통신 문제 발생 시 디버깅 순서**

```bash
# 1. 컨테이너가 같은 네트워크에 있는지 확인
docker network inspect app-network

# 2. 컨테이너 안에서 DNS 해석 확인
docker exec -it api sh -c "nslookup db"

# 3. 컨테이너 안에서 포트 연결 확인
docker exec -it api sh -c "nc -zv db 5432"

# 4. 대상 컨테이너가 실제로 해당 포트를 리슨하고 있는지 확인
docker exec -it db sh -c "ss -tlnp"
```

이 순서대로 확인하면 네트워크 문제인지, DNS 문제인지, 포트 문제인지, 서비스 기동 문제인지 빠르게 좁혀갈 수 있다.

## Notes

- docker-compose에서 `networks`를 명시하지 않으면 `프로젝트명_default`라는 네트워크가 자동 생성되고 모든 서비스가 여기에 속한다. 명시적으로 선언하는 것이 관리 측면에서 명확하다
- `depends_on`은 컨테이너 시작 순서만 보장하고, 서비스의 실제 준비 완료(예: DB가 커넥션을 받을 준비)는 보장하지 않는다. 헬스체크와 함께 사용해야 한다
- 여러 docker-compose 파일에서 컨테이너가 서로 통신해야 한다면, 외부 네트워크(external network)를 선언하여 공유해야 한다
- 컨테이너 간 통신에는 `ports` 매핑이 필요 없다. `ports`는 호스트 노출 용도이고, 같은 네트워크 안에서는 `expose`에 선언된 포트(또는 이미지 기본 포트)로 직접 통신한다
