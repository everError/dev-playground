**Title:** EF Core 대량 INSERT 시 극심한 속도 저하 (건별 INSERT 생성 문제)

**Category:** DB

**Stack:** .NET, EF Core, PostgreSQL, SQL Server

**Status:** Resolved

**Priority:** High

---

## Environment

- ORM: Entity Framework Core
- DB: PostgreSQL 또는 SQL Server
- 수천~수만 건 이상의 데이터를 한 번에 INSERT하는 배치성 작업이 존재하는 구조

## Symptom

수천 건 이상의 데이터를 INSERT하는 작업이 비정상적으로 오래 걸린다. 100건 정도는 문제없지만 1만 건 이상부터 수십 초에서 수 분까지 소요되며, 10만 건 이상이면 타임아웃이 발생하기도 한다. DB 서버의 CPU와 I/O가 치솟고, 해당 테이블에 대한 다른 쿼리도 함께 느려진다.

## Cause

EF Core의 `SaveChanges()`는 Change Tracker에 등록된 엔티티를 기반으로 SQL을 생성한다. 대량 INSERT 시 다음과 같은 문제가 겹친다.

**건별 INSERT 생성**

```csharp
foreach (var item in items)  // 10,000건
{
    context.Products.Add(item);
}
await context.SaveChangesAsync();
```

이 코드는 내부적으로 1만 개의 개별 INSERT 문을 생성한다. EF Core 7 이상에서는 배치로 묶어서 보내긴 하지만, 여전히 각 행마다 별도의 INSERT 구문이 만들어진다. 한 번의 `SaveChanges()` 호출에 수천 개의 SQL 문이 실행되는 것이다.

**Change Tracker 오버헤드**

`Add()`를 호출할 때마다 Change Tracker가 해당 엔티티의 상태를 추적한다. 1만 건이면 1만 개의 엔티티가 메모리에 추적 상태로 유지되며, `SaveChanges()` 호출 시 모든 엔티티의 변경 감지(DetectChanges)를 수행한다. 엔티티 수가 늘어날수록 이 과정의 비용이 기하급수적으로 증가한다.

**라운드 트립 횟수**

배치로 묶더라도 한 번에 보낼 수 있는 파라미터 수에 제한이 있다 (SQL Server 기준 2,100개). 컬럼이 10개인 테이블에 1만 건을 넣으면 파라미터가 10만 개이므로, 수십 번의 라운드 트립이 발생한다.

결과적으로 EF Core의 `SaveChanges()`는 건별 정합성이 중요한 OLTP 작업에 최적화되어 있지, 대량 데이터 적재에는 적합하지 않다.

## Solution

**방법 1. EF Core의 AddRange + 배치 분할 (소규모 개선)**

가장 간단한 개선으로, 최소한 `Add()` 대신 `AddRange()`를 쓰고, 일정 단위로 나눠서 저장한다.

```csharp
const int batchSize = 1000;

for (int i = 0; i < items.Count; i += batchSize)
{
    var batch = items.Skip(i).Take(batchSize).ToList();
    context.Products.AddRange(batch);
    await context.SaveChangesAsync();
    context.ChangeTracker.Clear();  // 추적 해제하여 메모리 확보
}
```

`ChangeTracker.Clear()`로 배치마다 추적을 해제하면 메모리 누적과 DetectChanges 비용을 줄일 수 있다. 다만 여전히 건별 INSERT이므로 근본적인 해결은 아니다.

**방법 2. EFCore.BulkExtensions 사용 (권장)**

```csharp
// 설치: dotnet add package EFCore.BulkExtensions
using EFCore.BulkExtensions;

await context.BulkInsertAsync(items);
```

내부적으로 SQL Server에서는 `SqlBulkCopy`, PostgreSQL에서는 `COPY` 명령을 사용하여 데이터를 일괄 전송한다. EF Core의 Change Tracker를 거치지 않으므로 오버헤드가 없다. 1만 건 기준으로 `SaveChanges()` 대비 10~50배 이상 빠르다.

```csharp
// 옵션 설정도 가능
await context.BulkInsertAsync(items, new BulkConfig
{
    BatchSize = 5000,
    SetOutputIdentity = true,  // 생성된 ID를 엔티티에 반영
    PreserveInsertOrder = true
});
```

**방법 3. DB 네이티브 명령 직접 사용 (최대 성능)**

ORM을 완전히 우회하고 DB의 벌크 적재 기능을 직접 사용한다.

SQL Server — SqlBulkCopy:

```csharp
using var bulkCopy = new SqlBulkCopy(connectionString);
bulkCopy.DestinationTableName = "Products";
bulkCopy.BatchSize = 5000;

var dataTable = ConvertToDataTable(items);
await bulkCopy.WriteToServerAsync(dataTable);
```

PostgreSQL — COPY:

```csharp
using var writer = conn.BeginBinaryImport(
    "COPY products (name, price, category) FROM STDIN (FORMAT BINARY)");

foreach (var item in items)
{
    writer.StartRow();
    writer.Write(item.Name, NpgsqlDbType.Text);
    writer.Write(item.Price, NpgsqlDbType.Numeric);
    writer.Write(item.Category, NpgsqlDbType.Text);
}

await writer.CompleteAsync();
```

EF Core 의존 없이 최대 성능을 낼 수 있지만, 스키마 변경 시 수동으로 코드를 맞춰야 하는 유지보수 비용이 있다.

**방법별 성능 비교 (1만 건 INSERT 기준, 참고값)**

| 방법                 | 대략적인 소요 시간 | 비고                         |
| -------------------- | ------------------ | ---------------------------- |
| SaveChanges (건별)   | 10~30초            | Change Tracker 오버헤드 포함 |
| AddRange + 배치 분할 | 5~15초             | 메모리 개선, SQL은 동일      |
| BulkExtensions       | 0.5~2초            | SqlBulkCopy/COPY 사용        |
| 네이티브 벌크 명령   | 0.3~1초            | ORM 완전 우회                |

## Notes

- `BulkInsert` 외에 `BulkUpdate`, `BulkDelete`, `BulkInsertOrUpdate`(Upsert)도 제공되므로, 대량 수정/삭제 작업에도 동일하게 적용할 수 있다
- 벌크 INSERT 시에는 트리거, 인덱스, 제약 조건이 성능에 큰 영향을 미친다. 대량 적재 전에 인덱스를 비활성화하고 완료 후 재빌드하는 것도 고려할 수 있다
- EF Core 7부터 `ExecuteUpdate()`, `ExecuteDelete()`가 추가되어 단순 대량 수정/삭제는 Change Tracker 없이 처리할 수 있다. 다만 INSERT에 대한 벌크 지원은 여전히 별도 라이브러리가 필요하다
- `SaveChanges()`와 `BulkInsert`를 같은 트랜잭션에 묶으려면 명시적 트랜잭션(`BeginTransaction`)을 사용해야 한다
