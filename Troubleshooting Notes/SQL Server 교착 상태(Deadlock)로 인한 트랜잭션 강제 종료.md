**Title:** SQL Server 교착 상태(Deadlock)로 인한 트랜잭션 강제 종료

**Category:** DB

**Stack:** .NET, EF Core, SQL Server

**Status:** Resolved

**Priority:** High

---

## Environment

- DB: SQL Server
- ORM: Entity Framework Core
- 다수의 동시 요청이 같은 테이블을 읽고 쓰는 구조 (API 서버, 배치 작업 등)

## Symptom

운영 중 간헐적으로 다음과 같은 에러가 발생한다.

```
Transaction (Process ID XX) was deadlocked on lock resources with another process
and has been chosen as the deadlock victim. Rerun the transaction.
```

특정 시간대에 집중적으로 발생하거나, 동시 요청이 몰리는 상황에서 나타난다. 단건 테스트에서는 절대 재현되지 않고, 부하가 있을 때만 간헐적으로 발생하여 원인 파악이 어렵다. SQL Server가 트랜잭션 하나를 강제 종료(victim 선정)하므로 해당 요청은 실패하고, 데이터 정합성에도 영향을 줄 수 있다.

## Cause

교착 상태는 두 개 이상의 트랜잭션이 서로가 점유한 리소스를 기다리면서 어느 쪽도 진행할 수 없는 상태다.

**기본 발생 구조**

```
트랜잭션 A                          트랜잭션 B
─────────                          ─────────
1. 테이블 X에 잠금 획득              1. 테이블 Y에 잠금 획득
2. 테이블 Y에 잠금 요청 → 대기       2. 테이블 X에 잠금 요청 → 대기
   (B가 Y를 점유 중)                   (A가 X를 점유 중)
```

A는 B가 Y를 풀어주길 기다리고, B는 A가 X를 풀어주길 기다린다. 서로가 서로를 기다리므로 영원히 풀리지 않는다. SQL Server는 이를 감지하면 비용이 낮은 쪽을 victim으로 선정하여 강제 롤백한다.

**실제로 흔히 발생하는 패턴들**

패턴 1. 서로 다른 순서로 테이블에 접근:

```csharp
// 서비스 A: 주문 → 재고 순서
async Task ProcessOrder(int productId, int quantity)
{
    var order = await context.Orders.AddAsync(newOrder);     // Orders 잠금
    await context.SaveChangesAsync();
    var stock = await context.Stocks.FirstAsync(s => s.ProductId == productId);
    stock.Quantity -= quantity;                                // Stocks 잠금
    await context.SaveChangesAsync();
}

// 서비스 B: 재고 → 주문 순서
async Task AdjustStock(int productId)
{
    var stock = await context.Stocks.FirstAsync(s => s.ProductId == productId);
    stock.Quantity = newQuantity;                              // Stocks 잠금
    await context.SaveChangesAsync();
    var orders = await context.Orders.Where(o => o.ProductId == productId)
        .ToListAsync();                                       // Orders 잠금
    // 주문 상태 업데이트...
    await context.SaveChangesAsync();
}
```

두 서비스가 동시에 실행되면 A는 Orders → Stocks, B는 Stocks → Orders 순서로 잠금을 획득하면서 교착 상태에 빠진다.

패턴 2. 같은 테이블 내에서 인덱스 잠금 충돌:

하나의 트랜잭션이 클러스터드 인덱스로 행을 잠그고, 다른 트랜잭션이 넌클러스터드 인덱스를 통해 같은 행에 접근하면 인덱스 간 잠금 순서 차이로 교착 상태가 발생할 수 있다.

패턴 3. SELECT가 공유 잠금을 오래 유지:

트랜잭션 내에서 SELECT로 공유 잠금을 획득한 뒤 긴 비즈니스 로직을 수행하는 동안, 다른 트랜잭션의 UPDATE가 배타 잠금으로 승격하려다 충돌한다.

## Solution

**1. 리소스 접근 순서를 통일한다 (가장 근본적)**

교착 상태의 핵심 원인은 접근 순서가 다르다는 것이다. 모든 트랜잭션이 같은 순서로 테이블에 접근하면 교착 상태가 원천적으로 발생하지 않는다.

```csharp
// 규칙: 항상 Orders → Stocks → Payments 순서로 접근
// 모든 서비스에서 이 순서를 준수한다

async Task ProcessOrder(int productId, int quantity)
{
    using var transaction = await context.Database.BeginTransactionAsync();

    // 1. Orders 먼저
    var order = await context.Orders.AddAsync(newOrder);
    await context.SaveChangesAsync();

    // 2. Stocks 다음
    var stock = await context.Stocks.FirstAsync(s => s.ProductId == productId);
    stock.Quantity -= quantity;
    await context.SaveChangesAsync();

    await transaction.CommitAsync();
}
```

팀 내에서 테이블 접근 순서를 문서화하고 코드 리뷰에서 검증하는 것이 중요하다.

**2. 트랜잭션 범위를 최소화한다**

```csharp
// Bad: 트랜잭션 안에서 외부 API 호출, 긴 연산 수행
using var transaction = await context.Database.BeginTransactionAsync();
var data = await context.Products.ToListAsync();       // 잠금 획득
var result = await ExternalApi.Validate(data);          // 수 초 대기 (잠금 유지 중)
data.ForEach(d => d.Status = result.Status);
await context.SaveChangesAsync();
await transaction.CommitAsync();

// Good: 외부 호출은 트랜잭션 밖에서, DB 작업만 트랜잭션 안에서
var data = await context.Products.AsNoTracking().ToListAsync();  // 트랜잭션 밖
var result = await ExternalApi.Validate(data);                    // 트랜잭션 밖

using var transaction = await context.Database.BeginTransactionAsync();
var products = await context.Products
    .Where(p => ids.Contains(p.Id)).ToListAsync();
products.ForEach(p => p.Status = result.Status);
await context.SaveChangesAsync();
await transaction.CommitAsync();                                  // 최소 범위
```

잠금 유지 시간이 짧을수록 다른 트랜잭션과 충돌할 확률이 줄어든다.

**3. 읽기 전용 쿼리에서 잠금을 피한다**

```csharp
// 방법 A: AsNoTracking + READ COMMITTED SNAPSHOT
var products = await context.Products
    .AsNoTracking()
    .ToListAsync();

// 방법 B: 트랜잭션 격리 수준을 READ UNCOMMITTED로 낮춤 (주의 필요)
using var transaction = await context.Database
    .BeginTransactionAsync(IsolationLevel.ReadUncommitted);
```

SQL Server의 기본 격리 수준(READ COMMITTED)에서는 SELECT도 공유 잠금을 획득한다. READ COMMITTED SNAPSHOT ISOLATION(RCSI)을 활성화하면 읽기 시 잠금 없이 스냅샷을 사용하므로 교착 상태 가능성이 크게 줄어든다.

```sql
-- DB 레벨에서 RCSI 활성화 (운영 중 설정 가능하나 일시적 블로킹 발생)
ALTER DATABASE [YourDB] SET READ_COMMITTED_SNAPSHOT ON;
```

**4. Deadlock 발생 시 재시도 로직을 구현한다**

교착 상태를 완전히 제거하는 것은 현실적으로 어렵다. SQL Server 에러 코드 1205를 감지하여 자동 재시도하는 로직을 넣는 것이 실무적으로 필수다.

```csharp
public async Task ExecuteWithRetryAsync(Func<Task> action, int maxRetries = 3)
{
    for (int attempt = 1; attempt <= maxRetries; attempt++)
    {
        try
        {
            await action();
            return;
        }
        catch (SqlException ex) when (ex.Number == 1205) // Deadlock victim
        {
            if (attempt == maxRetries) throw;

            var delay = TimeSpan.FromMilliseconds(100 * Math.Pow(2, attempt)); // 지수 백오프
            await Task.Delay(delay);
        }
    }
}

// 사용
await ExecuteWithRetryAsync(async () =>
{
    using var transaction = await context.Database.BeginTransactionAsync();
    // DB 작업...
    await transaction.CommitAsync();
});
```

**5. 교착 상태 원인을 진단한다**

발생 시 원인을 추적하려면 SQL Server의 Deadlock Graph를 활성화해야 한다.

```sql
-- 확장 이벤트로 Deadlock 추적 활성화
CREATE EVENT SESSION [DeadlockTracker] ON SERVER
ADD EVENT sqlserver.xml_deadlock_report
ADD TARGET package0.event_file(SET filename=N'DeadlockTracker')
WITH (STARTUP_STATE=ON);
```

Deadlock Graph에서 어떤 세션이 어떤 리소스를 잡고 있었는지, 어떤 쿼리가 충돌했는지 확인할 수 있다. 이 정보를 기반으로 접근 순서 통일이나 인덱스 조정을 진행한다.

## Notes

- RCSI 활성화는 교착 상태 감소에 가장 효과적인 단일 조치다. 다만 tempdb 사용량이 증가하므로 tempdb 파일 분할이 선행되어야 한다
- EF Core의 `EnableRetryOnFailure()`는 커넥션 실패에 대한 재시도이고, Deadlock(1205)은 기본 재시도 대상에 포함되지 않는다. 별도의 재시도 로직이 필요하다
- 인덱스 설계도 교착 상태에 영향을 준다. 커버링 인덱스를 사용하면 클러스터드 인덱스 접근 없이 조회가 가능하여 잠금 충돌이 줄어든다
- PostgreSQL에서는 기본적으로 MVCC를 사용하므로 읽기-쓰기 간 교착 상태가 발생하지 않는다. 쓰기-쓰기 간에는 발생할 수 있으며, `deadlock_timeout` 설정으로 감지 주기를 조절한다
