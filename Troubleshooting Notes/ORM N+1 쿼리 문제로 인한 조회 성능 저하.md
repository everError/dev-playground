**Title:** ORM N+1 쿼리 문제로 인한 조회 성능 저하

**Category:** Backend

**Stack:** .NET, EF Core

**Status:** Resolved

**Priority:** High

---

## Environment

- ORM: Entity Framework Core (JPA/Hibernate에서도 동일하게 발생)
- 연관 관계가 있는 엔티티 조회 시 발생

## Symptom

특정 API의 응답 속도가 비정상적으로 느리다. DB 로그를 확인하면 단순한 목록 조회임에도 예상보다 훨씬 많은 수의 SELECT 쿼리가 실행되고 있다. 데이터가 늘어날수록 쿼리 수가 비례하여 증가하며 성능이 급격히 떨어진다.

## Cause

ORM에서 연관 관계가 있는 엔티티를 조회할 때 발생하는 N+1 문제이다.

예를 들어 `Blog`와 `Post`가 1:N 관계일 때, 모든 블로그를 조회한 뒤 반복문에서 각 블로그의 포스트에 접근하면 다음과 같이 동작한다.

- 1회: 모든 `Blog`를 조회하는 쿼리 실행
- N회: 각 `Blog`의 `Posts` 컬렉션에 접근할 때마다 해당 블로그의 `Post`를 조회하는 쿼리가 개별 실행

블로그가 100개면 총 101개의 쿼리가 실행되는 것이다. 이는 지연 로딩(Lazy Loading) 전략에서 발생한다. EF Core는 기본적으로 지연 로딩이 비활성화되어 있지만, `virtual` 키워드나 프록시 설정으로 활성화한 경우 이 문제가 발생한다.

## Solution

핵심은 메인 엔티티를 조회할 때 연관된 엔티티를 함께 로드하여 쿼리 횟수를 줄이는 것이다.

**방법 1. Include()를 사용한 즉시 로딩 (가장 일반적)**

```csharp
// Before: N+1 발생
var blogs = context.Blogs.ToList();
foreach (var blog in blogs)
{
    Console.WriteLine(blog.Posts.Count); // 여기서 매번 쿼리 발생
}

// After: JOIN으로 한 번에 조회
var blogs = context.Blogs
    .Include(b => b.Posts)
    .ToList();
```

EF Core가 내부적으로 LEFT JOIN 쿼리를 생성하여 한 번에 모든 데이터를 가져온다. 다단계 관계는 `ThenInclude()`로 처리한다.

```csharp
var blogs = context.Blogs
    .Include(b => b.Posts)
        .ThenInclude(p => p.Comments)
    .ToList();
```

**방법 2. Select()를 사용한 프로젝션 (성능 최적화)**

필요한 데이터만 DTO로 가져오면 불필요한 컬럼 로드를 방지할 수 있다.

```csharp
var result = context.Blogs
    .Select(b => new BlogDto
    {
        Name = b.Name,
        PostCount = b.Posts.Count,
        PostTitles = b.Posts.Select(p => p.Title).ToList()
    })
    .ToList();
```

EF Core가 JOIN 쿼리를 생성하므로 N+1 문제가 발생하지 않고, 필요한 필드만 조회하여 네트워크 및 메모리 사용량도 줄어든다.

**방법 3. 명시적 로딩 (특정 조건에서만 로드할 때)**

```csharp
var blog = context.Blogs.First();
context.Entry(blog)
    .Collection(b => b.Posts)
    .Load();
```

쿼리 시점을 개발자가 직접 제어할 수 있어, 조건에 따라 연관 데이터를 선택적으로 로드해야 할 때 유용하다.

## Notes

- 일반적인 목록 조회에는 방법 1(`Include`)이 가장 무난하다
- API 응답에 필요한 필드가 제한적이라면 방법 2(프로젝션)가 성능상 가장 유리하다
- `Include`가 과도하게 중첩되면 쿼리가 복잡해지고 카테시안 곱 문제가 발생할 수 있다. EF Core 5.0 이상에서는 `AsSplitQuery()`로 쿼리를 분리하는 것도 방법이다
- JPA/Hibernate에서는 `Fetch Join`, `@EntityGraph`, `Batch Size` 설정으로 동일한 문제를 해결한다
