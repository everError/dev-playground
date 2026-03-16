**Title:** Docker Compose 서비스 의존 순서 문제로 API 서버 기동 실패

**Category:** Infra

**Stack:** Docker, .NET, PostgreSQL

**Status:** Resolved

**Priority:** High

---

## Environment

- Docker Compose
- API 서버: .NET (Kestrel)
- DB: PostgreSQL (또는 SQL Server 등)
- API 서버가 기동 시 DB 커넥션을 맺는 구조

## Symptom

`docker-compose up`으로 전체 서비스를 띄우면 API 서버가 다음과 같은 에러를 내며 기동에 실패하거나, 기동 직후 요청에서 에러가 발생한다.

```
Npgsql.NpgsqlException: Failed to connect to 127.0.0.1:5432
Connection refused

// 또는 EF Core 마이그레이션 자동 적용 시
Microsoft.EntityFrameworkCore.Database: An error occurred using the connection to database 'mydb' on server 'db'.
```

`docker-compose restart api`로 API만 다시 시작하면 정상 동작한다. 처음 전체 기동 시에만 발생하고, DB가 완전히 준비된 후에 API를 시작하면 문제가 없다.

## Cause

docker-compose의 `depends_on`은 컨테이너의 시작 순서만 보장하고, 서비스의 실제 준비 완료는 보장하지 않는다.

```yaml
services:
  api:
    depends_on:
      - db # db 컨테이너가 "시작"된 후 api를 시작
  db:
    image: postgres:16
```

이 설정은 db 컨테이너의 프로세스가 시작된 직후 api 컨테이너를 시작한다. 하지만 PostgreSQL이 실제로 커넥션을 받을 준비가 되려면 다음 과정을 거쳐야 한다.

1. 컨테이너 프로세스 시작 ← `depends_on`은 여기까지만 보장
2. PostgreSQL 초기화 (데이터 디렉토리 생성, 설정 로드)
3. 초기 SQL 스크립트 실행 (initdb)
4. TCP 소켓 리슨 시작 ← 여기서부터 커넥션 수락 가능

1번과 4번 사이에 수 초의 간격이 있다. API 서버가 이 사이에 기동되어 DB에 커넥션을 시도하면 실패한다. 특히 EF Core 마이그레이션을 시작 시점에 자동 적용하는 경우, 기동 초기에 즉시 DB 연결을 시도하므로 높은 확률로 실패한다.

이 문제는 PostgreSQL뿐 아니라 SQL Server, Redis, RabbitMQ 등 초기화 시간이 필요한 모든 서비스에서 동일하게 발생한다.

## Solution

**방법 1. depends_on + healthcheck 조합 사용 (권장)**

docker-compose v2.1 이상에서는 `depends_on`에 `condition`을 지정하여 헬스체크 통과 후 시작하도록 설정할 수 있다.

```yaml
services:
  api:
    build: ./api
    depends_on:
      db:
        condition: service_healthy # db가 healthy 상태일 때만 시작
    environment:
      - ConnectionStrings__Default=Server=db;Port=5432;Database=mydb;...

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin -d mydb"]
      interval: 3s
      timeout: 3s
      retries: 10
      start_period: 5s
```

`pg_isready`는 PostgreSQL이 실제로 커넥션을 받을 수 있는 상태인지 확인하는 공식 유틸리티다. 헬스체크가 통과(`healthy`)될 때까지 API 컨테이너의 시작이 지연된다.

SQL Server의 경우:

```yaml
db:
  image: mcr.microsoft.com/mssql/server:2022-latest
  healthcheck:
    test:
      [
        "CMD-SHELL",
        "/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P $${SA_PASSWORD} -C -Q 'SELECT 1' || exit 1",
      ]
    interval: 3s
    timeout: 3s
    retries: 10
    start_period: 10s
```

**방법 2. 애플리케이션 레벨에서 재시도 로직을 구현한다**

인프라 설정과 별개로, 애플리케이션 자체가 DB 연결 실패에 대한 복원력을 갖추는 것이 안전하다.

EF Core 연결 재시도 설정:

```csharp
// PostgreSQL (Npgsql)
services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString, npgsqlOptions =>
    {
        npgsqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorCodesToAdd: null);
    }));

// SQL Server
services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(connectionString, sqlOptions =>
    {
        sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null);
    }));
```

이렇게 하면 DB가 아직 준비되지 않아도 API 서버가 일단 기동된 뒤, 첫 DB 요청 시 자동으로 재시도한다.

**방법 3. 시작 시점에 직접 대기 로직을 넣는다**

EF Core 마이그레이션 자동 적용처럼 기동 초기에 반드시 DB가 필요한 경우, `Program.cs`에서 직접 대기한다.

```csharp
var builder = WebApplication.CreateBuilder(args);
// ... 서비스 등록

var app = builder.Build();

// DB 준비될 때까지 대기
await WaitForDatabase(app.Services);

// 마이그레이션 적용
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

app.Run();

async Task WaitForDatabase(IServiceProvider services, int maxRetries = 30)
{
    using var scope = services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    for (int i = 1; i <= maxRetries; i++)
    {
        try
        {
            await db.Database.CanConnectAsync();
            return;
        }
        catch
        {
            Console.WriteLine($"DB 연결 대기 중... ({i}/{maxRetries})");
            await Task.Delay(2000);
        }
    }
    throw new Exception("DB 연결 실패: 최대 재시도 횟수 초과");
}
```

**실무에서는 방법 1 + 방법 2를 함께 적용하는 것이 가장 안전하다.** 헬스체크로 시작 순서를 보장하되, 운영 중 일시적 커넥션 끊김에도 대응할 수 있도록 재시도 로직을 함께 넣는다.

## Notes

- `depends_on`의 `condition: service_healthy`는 docker-compose v2 파일 포맷에서 지원한다. v3에서는 한때 제거되었다가 Docker Compose V2(CLI 플러그인)에서 다시 지원되므로, `docker compose version`으로 버전을 확인해야 한다
- `start_period`는 컨테이너 시작 후 헬스체크를 시작하기까지의 유예 시간이다. 이 기간 동안의 실패는 재시도 횟수에 포함되지 않으므로, 초기화가 오래 걸리는 서비스에 적절히 설정해야 한다
- DB 외에 Redis, RabbitMQ, Elasticsearch 등도 동일한 패턴을 적용한다. 각 서비스에 맞는 헬스체크 명령어를 사용하면 된다 (Redis: `redis-cli ping`, RabbitMQ: `rabbitmq-diagnostics -q check_running`)
- `restart: on-failure`나 `restart: unless-stopped`를 설정하면 기동 실패 시 자동 재시작되어 결과적으로 해결되는 것처럼 보이지만, 근본 해결이 아니고 불필요한 에러 로그가 쌓이므로 권장하지 않는다
