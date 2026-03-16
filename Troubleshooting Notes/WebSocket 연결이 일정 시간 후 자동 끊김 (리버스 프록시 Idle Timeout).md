**Title:** WebSocket 연결이 일정 시간 후 자동 끊김 (리버스 프록시 Idle Timeout)

**Category:** Network

**Stack:** Caddy, .NET, Vue

**Status:** Resolved

**Priority:** High

---

## Environment

- Web Server / Reverse Proxy: Caddy
- Backend: .NET Kestrel (WebSocket 서버)
- Frontend: Vue (WebSocket 클라이언트)
- Caddy를 통해 WebSocket 요청을 백엔드로 프록시하는 구조

## Symptom

WebSocket 연결이 정상적으로 수립된 후, 데이터 교환이 없는 상태로 일정 시간(수십 초 ~ 수 분)이 지나면 연결이 자동으로 끊긴다. 클라이언트 측에서는 `onclose` 이벤트가 발생하고, 에러 코드는 `1006`(비정상 종료)인 경우가 많다. 데이터를 계속 주고받는 동안에는 문제가 없고, 유휴 상태에서만 발생한다.

## Cause

Caddy를 포함한 대부분의 리버스 프록시는 연결에 idle timeout을 적용한다. WebSocket은 HTTP Upgrade를 통해 수립되지만, 프록시 입장에서는 여전히 하나의 TCP 연결이다. 일정 시간 동안 데이터가 오가지 않으면 프록시가 이 연결을 유휴 상태로 판단하고 강제 종료한다.

문제가 발생하는 흐름은 다음과 같다.

1. 클라이언트가 Caddy를 통해 WebSocket 연결을 수립한다
2. 양쪽 모두 데이터를 보내지 않는 유휴 상태에 진입한다
3. Caddy의 `read_timeout` 또는 `write_timeout`에 도달한다
4. Caddy가 연결을 끊고, 클라이언트는 `onclose(1006)`을 받는다

Caddy의 기본 타임아웃은 비교적 짧고, 별도 설정이 없으면 WebSocket처럼 장시간 유지가 필요한 연결도 동일한 기준이 적용된다.

## Solution

**1. Caddy의 타임아웃을 WebSocket에 맞게 늘린다**

현재 Caddyfile의 WebSocket 핸들 블록에 이미 타임아웃이 설정되어 있다면, 값이 충분한지 확인한다.

```caddy
handle /ws* {
    reverse_proxy backend-service:80 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        transport http {
            read_timeout 86400s
            write_timeout 86400s
        }
    }
}
```

`read_timeout`과 `write_timeout`을 충분히 크게 설정하면 프록시 레벨에서 연결을 끊지 않는다. 다만 이것만으로는 중간 네트워크 장비(로드밸런서, 방화벽 등)의 타임아웃까지 제어할 수 없다.

**2. 클라이언트 측에서 Heartbeat(Ping)를 구현한다 (핵심)**

프록시 타임아웃을 아무리 늘려도, 중간 경로의 모든 장비를 제어할 수는 없다. 클라이언트에서 주기적으로 ping 메시지를 보내 연결을 유휴 상태에 빠지지 않게 하는 것이 근본적인 해결책이다.

```javascript
let ws = null;
let heartbeatTimer = null;

function connect() {
  ws = new WebSocket("wss://example.com/ws");

  ws.onopen = () => {
    startHeartbeat();
  };

  ws.onmessage = (event) => {
    if (event.data === "pong") return; // heartbeat 응답은 무시
    // 실제 메시지 처리
  };

  ws.onclose = () => {
    stopHeartbeat();
    // 재연결 로직
    setTimeout(connect, 3000);
  };
}

function startHeartbeat() {
  heartbeatTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send("ping");
    }
  }, 30000); // 30초마다 ping
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
```

**3. 서버 측에서 Ping에 응답한다**

```csharp
// .NET WebSocket 핸들러
while (socket.State == WebSocketState.Open)
{
    var result = await socket.ReceiveAsync(buffer, cancellationToken);

    var message = Encoding.UTF8.GetString(buffer, 0, result.Count);

    if (message == "ping")
    {
        var pong = Encoding.UTF8.GetBytes("pong");
        await socket.SendAsync(pong, WebSocketMessageType.Text, true, cancellationToken);
        continue;
    }

    // 실제 메시지 처리
}
```

**4. 재연결 로직에서 이벤트 리스너 중복 등록을 방지한다**

연결이 끊어진 후 재연결할 때, 기존 WebSocket 인스턴스를 정리하지 않으면 `onmessage` 핸들러가 중복 등록되어 메시지가 여러 번 처리될 수 있다. 위 코드처럼 재연결 시 새 인스턴스를 생성하고, 이전 인스턴스의 타이머를 반드시 정리해야 한다.

## Notes

- Heartbeat 주기는 프록시의 가장 짧은 타임아웃보다 작아야 한다. 일반적으로 30초가 무난하다
- WebSocket 프로토콜 자체에 Ping/Pong 프레임이 있지만, 브라우저 WebSocket API에서는 프로토콜 레벨 Ping을 직접 보낼 수 없다. 따라서 애플리케이션 레벨에서 별도 구현해야 한다
- 서버 측에서도 클라이언트의 응답이 없으면 연결을 정리하는 로직을 추가하면, 좀비 커넥션 누적을 방지할 수 있다
- Docker 환경에서 추가 프록시 레이어(Nginx, AWS ALB 등)가 있다면 해당 장비의 idle timeout도 함께 확인해야 한다
