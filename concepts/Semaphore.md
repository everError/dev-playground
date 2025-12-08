## 세마포어 (Semaphore)

---

### 1. 개념

**세마포어**는 1965년 다익스트라(Dijkstra)가 고안한 동기화 도구로, 공유 자원에 대한 동시 접근 수를 제한합니다.

**비유:** 놀이공원 놀이기구를 생각해보세요.

- 한 번에 탑승 가능 인원: 4명 (카운트 = 4)
- 사람이 탈 때마다 카운트 감소
- 내릴 때마다 카운트 증가
- 카운트가 0이면 줄 서서 대기

---

### 2. 핵심 연산

| 연산  | 다른 이름           | 동작                                     |
| ----- | ------------------- | ---------------------------------------- |
| **P** | wait, acquire, down | 카운트 > 0이면 감소 후 진입, 아니면 대기 |
| **V** | signal, release, up | 카운트 증가, 대기 중인 스레드 깨움       |

> P와 V는 네덜란드어 Proberen(시도하다), Verhogen(증가시키다)의 약자

---

### 3. 종류

**이진 세마포어 (Binary Semaphore)**

- 카운트가 0 또는 1만 가능
- 뮤텍스와 유사하게 상호 배제용

**카운팅 세마포어 (Counting Semaphore)**

- 카운트가 0 이상 N
- 제한된 수의 동시 접근 허용 (DB 커넥션 풀, API 요청 제한 등)

---

### 4. 뮤텍스와의 차이

| 구분         | 뮤텍스                  | 세마포어                  |
| ------------ | ----------------------- | ------------------------- |
| 동시 접근 수 | 1개만                   | N개까지                   |
| 소유권       | 잠근 스레드만 해제 가능 | 다른 스레드도 해제 가능   |
| 용도         | 상호 배제               | 리소스 풀 관리, 신호 전달 |
| 비유         | 화장실 열쇠 (1개)       | 주차장 (N자리)            |

---

### 5. 언어별 구현

---

#### C# (.NET)

**.NET 표준 라이브러리 제공:**

- `Semaphore` - 프로세스 간 동기화 가능, 이름 지정 가능
- `SemaphoreSlim` - 경량, 단일 프로세스용, async 지원 **(권장)**

**기본 사용법:**

```csharp
using System;
using System.Threading;
using System.Threading.Tasks;

class SemaphoreExample
{
    // 동시 3개까지 허용
    private static SemaphoreSlim _semaphore = new SemaphoreSlim(3, 3);

    static async Task Main()
    {
        Console.WriteLine("=== 세마포어 예제 시작 ===\n");

        // 6개 작업 생성 (3개만 동시 실행됨)
        var tasks = new Task[6];
        for (int i = 1; i <= 6; i++)
        {
            int workerId = i;
            tasks[i - 1] = ProcessAsync(workerId);
        }

        await Task.WhenAll(tasks);
        Console.WriteLine("\n=== 모든 작업 완료 ===");
    }

    static async Task ProcessAsync(int id)
    {
        Console.WriteLine($"[작업자 {id}] 대기 중... (현재 가용: {_semaphore.CurrentCount})");

        await _semaphore.WaitAsync();  // 세마포어 획득
        try
        {
            Console.WriteLine($"[작업자 {id}] ▶ 진입! 작업 시작");
            await Task.Delay(2000);  // 작업 시뮬레이션
            Console.WriteLine($"[작업자 {id}] ✓ 작업 완료");
        }
        finally
        {
            _semaphore.Release();  // 반드시 해제
        }
    }
}
```

**실행 결과:**

```
=== 세마포어 예제 시작 ===

[작업자 1] 대기 중... (현재 가용: 3)
[작업자 2] 대기 중... (현재 가용: 3)
[작업자 1] ▶ 진입! 작업 시작
[작업자 3] 대기 중... (현재 가용: 2)
[작업자 2] ▶ 진입! 작업 시작
[작업자 3] ▶ 진입! 작업 시작
[작업자 4] 대기 중... (현재 가용: 0)    ← 대기
[작업자 5] 대기 중... (현재 가용: 0)    ← 대기
[작업자 6] 대기 중... (현재 가용: 0)    ← 대기
[작업자 1] ✓ 작업 완료
[작업자 4] ▶ 진입! 작업 시작           ← 이제 진입
...
```

**실용 예시 - API Rate Limiter:**

```csharp
public class RateLimitedApiClient
{
    private readonly HttpClient _httpClient;
    private readonly SemaphoreSlim _throttler;

    public RateLimitedApiClient(int maxConcurrentRequests = 5)
    {
        _httpClient = new HttpClient();
        _throttler = new SemaphoreSlim(maxConcurrentRequests);
    }

    public async Task<string> GetAsync(string url)
    {
        await _throttler.WaitAsync();
        try
        {
            return await _httpClient.GetStringAsync(url);
        }
        finally
        {
            _throttler.Release();
        }
    }

    // 여러 URL을 동시에 가져오되 동시 요청 수 제한
    public async Task<string[]> GetManyAsync(string[] urls)
    {
        var tasks = urls.Select(url => GetAsync(url));
        return await Task.WhenAll(tasks);
    }
}
```

**프로세스 간 동기화 (Named Semaphore):**

```csharp
// 여러 프로세스가 공유하는 세마포어
// 예: 같은 프로그램을 최대 3개까지만 실행 허용

using var semaphore = new Semaphore(3, 3, "MyApp_GlobalSemaphore");

if (semaphore.WaitOne(0))  // 즉시 반환 (대기 안 함)
{
    try
    {
        Console.WriteLine("프로그램 실행 중...");
        Console.ReadLine();
    }
    finally
    {
        semaphore.Release();
    }
}
else
{
    Console.WriteLine("이미 3개 인스턴스가 실행 중입니다.");
}
```

---

#### Java

**표준 라이브러리:** `java.util.concurrent.Semaphore`

```java
import java.util.concurrent.Semaphore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class SemaphoreExample {

    // 동시 3개 허용
    private static final Semaphore semaphore = new Semaphore(3);

    public static void main(String[] args) {
        ExecutorService executor = Executors.newFixedThreadPool(6);

        for (int i = 1; i <= 6; i++) {
            final int workerId = i;
            executor.submit(() -> process(workerId));
        }

        executor.shutdown();
    }

    private static void process(int id) {
        try {
            System.out.printf("[작업자 %d] 대기 중...%n", id);

            semaphore.acquire();  // 세마포어 획득
            try {
                System.out.printf("[작업자 %d] 진입! 작업 중...%n", id);
                Thread.sleep(2000);
                System.out.printf("[작업자 %d] 완료%n", id);
            } finally {
                semaphore.release();  // 반드시 해제
            }

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

**공정성(Fairness) 옵션:**

```java
// fair = true: FIFO 순서 보장 (먼저 대기한 스레드가 먼저 획득)
Semaphore fairSemaphore = new Semaphore(3, true);

// fair = false (기본값): 순서 보장 안 함 (더 빠름)
Semaphore unfairSemaphore = new Semaphore(3, false);
```

**여러 개 동시 획득:**

```java
// 한 번에 2개 리소스 획득
semaphore.acquire(2);
try {
    // 작업
} finally {
    semaphore.release(2);
}
```

---

#### Python

**표준 라이브러리:** `threading.Semaphore`, `asyncio.Semaphore`

**스레드용:**

```python
import threading
import time

# 동시 3개 허용
semaphore = threading.Semaphore(3)

def worker(worker_id):
    print(f"[작업자 {worker_id}] 대기 중...")

    with semaphore:  # acquire/release 자동 처리
        print(f"[작업자 {worker_id}] 진입! 작업 중...")
        time.sleep(2)
        print(f"[작업자 {worker_id}] 완료")

# 6개 스레드 생성
threads = []
for i in range(1, 7):
    t = threading.Thread(target=worker, args=(i,))
    threads.append(t)
    t.start()

for t in threads:
    t.join()
```

**비동기용 (asyncio):**

```python
import asyncio

async def main():
    # 동시 3개 허용
    semaphore = asyncio.Semaphore(3)

    async def worker(worker_id):
        print(f"[작업자 {worker_id}] 대기 중...")

        async with semaphore:
            print(f"[작업자 {worker_id}] 진입!")
            await asyncio.sleep(2)
            print(f"[작업자 {worker_id}] 완료")

    # 6개 태스크 동시 실행
    tasks = [worker(i) for i in range(1, 7)]
    await asyncio.gather(*tasks)

asyncio.run(main())
```

**BoundedSemaphore (안전한 버전):**

```python
# release()를 acquire() 횟수보다 많이 호출하면 에러 발생
semaphore = threading.BoundedSemaphore(3)

semaphore.acquire()
semaphore.release()
semaphore.release()  # ValueError 발생! (일반 Semaphore는 허용)
```

---

#### Go

**표준 라이브러리:** 세마포어 없음, 채널로 구현하거나 `golang.org/x/sync/semaphore` 사용

**채널로 구현 (관용적 방법):**

```go
package main

import (
    "fmt"
    "sync"
    "time"
)

func main() {
    // 버퍼 크기 3인 채널 = 세마포어(3)
    semaphore := make(chan struct{}, 3)
    var wg sync.WaitGroup

    for i := 1; i <= 6; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()

            fmt.Printf("[작업자 %d] 대기 중...\n", id)

            semaphore <- struct{}{}  // acquire (빈 슬롯에 넣기)

            fmt.Printf("[작업자 %d] 진입!\n", id)
            time.Sleep(2 * time.Second)
            fmt.Printf("[작업자 %d] 완료\n", id)

            <-semaphore  // release (슬롯에서 빼기)
        }(i)
    }

    wg.Wait()
}
```

**공식 확장 패키지 사용:**

```go
package main

import (
    "context"
    "fmt"
    "sync"
    "time"

    "golang.org/x/sync/semaphore"
)

func main() {
    // 가중치 기반 세마포어 (동시 3개)
    sem := semaphore.NewWeighted(3)
    ctx := context.Background()
    var wg sync.WaitGroup

    for i := 1; i <= 6; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()

            sem.Acquire(ctx, 1)  // 가중치 1 획득
            defer sem.Release(1)

            fmt.Printf("[작업자 %d] 작업 중...\n", id)
            time.Sleep(2 * time.Second)
        }(i)
    }

    wg.Wait()
}
```

---

#### JavaScript/TypeScript (Node.js)

**표준 라이브러리:** 없음, 직접 구현 또는 라이브러리 사용

**직접 구현:**

```typescript
class Semaphore {
  private count: number;
  private waiting: (() => void)[] = [];

  constructor(private max: number) {
    this.count = max;
  }

  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return;
    }

    // 대기열에 추가
    await new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next(); // 대기 중인 다음 작업 깨움
    } else {
      this.count++;
    }
  }

  // 편의 메서드
  async use<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// 사용
async function main() {
  const semaphore = new Semaphore(3);

  const tasks = Array.from({ length: 6 }, (_, i) =>
    semaphore.use(async () => {
      console.log(`[작업자 ${i + 1}] 진입!`);
      await new Promise((r) => setTimeout(r, 2000));
      console.log(`[작업자 ${i + 1}] 완료`);
    })
  );

  await Promise.all(tasks);
}

main();
```

---

#### C/C++ (POSIX)

**POSIX 표준:** `<semaphore.h>`

```c
#include <stdio.h>
#include <pthread.h>
#include <semaphore.h>
#include <unistd.h>

sem_t semaphore;

void* worker(void* arg) {
    int id = *(int*)arg;

    printf("[작업자 %d] 대기 중...\n", id);

    sem_wait(&semaphore);  // P 연산

    printf("[작업자 %d] 진입!\n", id);
    sleep(2);
    printf("[작업자 %d] 완료\n", id);

    sem_post(&semaphore);  // V 연산

    return NULL;
}

int main() {
    pthread_t threads[6];
    int ids[6];

    // 세마포어 초기화 (프로세스 내 공유, 카운트 3)
    sem_init(&semaphore, 0, 3);

    for (int i = 0; i < 6; i++) {
        ids[i] = i + 1;
        pthread_create(&threads[i], NULL, worker, &ids[i]);
    }

    for (int i = 0; i < 6; i++) {
        pthread_join(threads[i], NULL);
    }

    sem_destroy(&semaphore);
    return 0;
}
```

**C++20 표준 (std::counting_semaphore):**

```cpp
#include <iostream>
#include <thread>
#include <semaphore>
#include <vector>

// C++20 표준 세마포어
std::counting_semaphore<3> semaphore{3};

void worker(int id) {
    std::cout << "[작업자 " << id << "] 대기 중...\n";

    semaphore.acquire();

    std::cout << "[작업자 " << id << "] 진입!\n";
    std::this_thread::sleep_for(std::chrono::seconds(2));
    std::cout << "[작업자 " << id << "] 완료\n";

    semaphore.release();
}

int main() {
    std::vector<std::thread> threads;

    for (int i = 1; i <= 6; i++) {
        threads.emplace_back(worker, i);
    }

    for (auto& t : threads) {
        t.join();
    }

    return 0;
}
```

---

### 6. 실제 활용 사례

| 사례                        | 설명                         |
| --------------------------- | ---------------------------- |
| **DB 커넥션 풀**            | 최대 연결 수 제한 (예: 10개) |
| **API Rate Limiting**       | 동시 요청 수 제한            |
| **리소스 풀 관리**          | 스레드 풀, 오브젝트 풀       |
| **Producer-Consumer**       | 버퍼 크기 제한               |
| **동시 실행 인스턴스 제한** | 프로그램 다중 실행 방지      |

---

### 7. 주의사항

| 문제            | 설명                            | 해결책                           |
| --------------- | ------------------------------- | -------------------------------- |
| **데드락**      | 서로 세마포어를 기다리며 멈춤   | 획득 순서 통일, 타임아웃 설정    |
| **릴리즈 누락** | finally 없이 예외 발생 시       | try-finally 또는 using/with 패턴 |
| **과다 릴리즈** | acquire보다 release를 많이 호출 | BoundedSemaphore 사용            |
| **기아 상태**   | 특정 스레드가 계속 대기         | 공정성(fairness) 옵션 활성화     |

---

### 8. 요약 비교표

| 언어       | 표준 라이브러리                            | 권장                       |
| ---------- | ------------------------------------------ | -------------------------- |
| **C#**     | `SemaphoreSlim`, `Semaphore`               | SemaphoreSlim (async 지원) |
| **Java**   | `java.util.concurrent.Semaphore`           | 표준 사용                  |
| **Python** | `threading.Semaphore`, `asyncio.Semaphore` | 표준 사용                  |
| **Go**     | 없음 (채널 또는 x/sync)                    | 채널 또는 semaphore 패키지 |
| **C++**    | C++20 `std::counting_semaphore`            | C++20 표준 또는 POSIX      |
| **JS/TS**  | 없음                                       | 직접 구현 또는 라이브러리  |
